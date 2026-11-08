"""Convert one local document; diagnostics are machine-readable JSON."""

import base64
import hashlib
import re
import json
import os
import sys
import zipfile

DIAGNOSTICS = {}

MAX_OUTPUT = 8 * 1024 * 1024


def run_pdf_worker(mode, source):
    import subprocess
    from pdf_md import ExtractionTimeout

    try:
        result = subprocess.run(
            [sys.executable, __file__, mode, source],
            capture_output=True,
            text=True,
            timeout=76 if mode == "--pdf-worker" else 35,
        )
    except subprocess.TimeoutExpired:
        raise ExtractionTimeout("This PDF is too large or complex to convert") from None
    if result.returncode:
        try:
            payload = json.loads(result.stderr.strip().splitlines()[-1])
        except (ValueError, IndexError):
            payload = {
                "error": "This PDF is too large or complex to convert",
                "code": "PDF_RESOURCE_LIMIT",
            }
        error = ValueError(payload["error"])
        error.code = (
            payload["code"]
            if payload["code"] != "CONVERSION_FAILED"
            else "PDF_EXTRACTION_FAILED"
        )
        raise error
    return json.loads(result.stdout)


def convert_document(source, isolated=False, warm=False, on_page=None):
    DIAGNOSTICS.clear()
    no_text = False
    if os.path.splitext(source)[1].lower() == ".pdf":
        from pdf_md import convert_pdf, NoTextLayer, PasswordProtected, ResourceLimit

        try:
            if isolated:
                try:
                    payload = run_pdf_worker("--pdf-worker", source)
                except ValueError as error:
                    if getattr(error, "code", None) == "NO_TEXT_LAYER":
                        raise NoTextLayer(str(error)) from None
                    if getattr(error, "code", None) == "PASSWORD_PROTECTED":
                        raise PasswordProtected(str(error)) from None
                    raise
                DIAGNOSTICS.update(payload["diagnostics"])
                return payload["text"], "pdf_md"
            return convert_pdf(source, DIAGNOSTICS, on_page=on_page), "pdf_md"
        except (PasswordProtected, ResourceLimit):
            raise
        except NoTextLayer:
            no_text = True
        except Exception as error:
            DIAGNOSTICS["fallback_code"] = getattr(
                error, "code", "PDF_EXTRACTION_FAILED"
            )
    try:
        if (isolated or warm) and os.path.splitext(source)[1].lower() == ".pdf":
            print(
                json.dumps(
                    {
                        "code": "PDF_FALLBACK",
                        "type": "Progress",
                        "error": "PDF too complex or large for the built-in parser; trying fallback…",
                    }
                ),
                file=sys.stderr,
                flush=True,
            )
            text = run_pdf_worker("--fallback-worker", source)["text"]
        else:
            text = fallback_text(source)
    except Exception as error:
        if getattr(error, "code", None) == "PDF_RESOURCE_LIMIT":
            raise
        if DIAGNOSTICS.get("fallback_code") in ("PDF_RESOURCE_LIMIT", "PDF_TIME_LIMIT"):
            from pdf_md import ResourceLimit

            error = ResourceLimit("This PDF is too large or complex to convert")
            error.code = DIAGNOSTICS["fallback_code"]
            raise error from None
        if no_text:
            from pdf_md import NoTextLayer

            raise NoTextLayer("no text layer; OCR not supported yet") from None
        raise
    if no_text and len(text.strip()) < 40:
        from pdf_md import NoTextLayer

        raise NoTextLayer("no text layer; OCR not supported yet")
    return text, "markitdown"


def fallback_text(source):
    from markitdown import MarkItDown

    return (
        MarkItDown(enable_plugins=False)
        .convert_local(source, keep_data_uris=True)
        .text_content
    )


def main():
    from limits import install_limits, peak_memory_bytes
    install_limits()
    import socket
    def deny_network(*args, **kwargs):
        raise PermissionError("Converter network disabled")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    import threading
    import time

    def monitor_memory():
        while True:
            rss = peak_memory_bytes()
            if rss > 1500 * 1024 * 1024:
                os.write(
                    2,
                    b'{"code":"PDF_RESOURCE_LIMIT","type":"ResourceLimit","error":"This PDF is too large or complex to convert"}\n',
                )
                os._exit(1)
            time.sleep(0.05)

    threading.Thread(target=monitor_memory, daemon=True).start()
    if len(sys.argv) == 3 and sys.argv[1] == "--fallback-worker":
        print(json.dumps({"text": fallback_text(sys.argv[2])}))
        return
    if len(sys.argv) == 3 and sys.argv[1] == "--pdf-worker":
        from pdf_md import convert_pdf

        diagnostics = {}
        text = convert_pdf(sys.argv[2], diagnostics)
        print(json.dumps({"text": text, "diagnostics": diagnostics}))
        return
    if len(sys.argv) != 4 and sys.argv[1:] != ["--warm-worker"]:
        raise ValueError("Usage: convert.py <input> <output.md> <library.md>")
    if len(sys.argv) == 2 and sys.argv[1] == "--warm-worker":
        warm_worker()
        return
    source, target, library_target = sys.argv[1:]
    publish(source, target, library_target)


def publish(source, target, library_target, warm=False):
    os.stat(source)
    # Office/EPUB containers can expand far beyond their on-disk size.
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            entries = archive.infolist()
            if (
                len(entries) > 10000
                or sum(e.file_size for e in entries) > 200 * 1024 * 1024
            ):
                raise ValueError("Document archive exceeds expansion limit")
    previews = []
    def page_done(page, total, text):
        if page > 5:
            print(json.dumps({"progress": f"Converting page {page}/{total}…"}), flush=True)
            return
        previews.append(text)
        content = "\n".join(previews).encode("utf-8")
        if len(content) > MAX_OUTPUT:
            raise ValueError("Converted Markdown exceeds 8 MiB")
        with open(target + ".partial.tmp", "wb") as output:
            output.write(content)
        os.replace(target + ".partial.tmp", target + ".partial")
        print(json.dumps({"progress": f"Converting page {page}/{total}…"}), flush=True)
    text, converter = convert_document(source, isolated=not warm, warm=warm, on_page=page_done if warm else None)

    from figures import FigureAssets, preserve_figures, decorative_images
    from PIL import Image
    import io
    from pypdfium2 import PdfiumError

    assets = FigureAssets(target + ".assets")
    try:
        text = preserve_figures(source, text, assets)
    except PdfiumError:
        DIAGNOSTICS["figure_warning"] = "PDF_FIGURES_UNAVAILABLE"
    excluded_images = decorative_images(source)

    def image(match):
        extension = {"jpeg": "jpg", "png": "png", "gif": "gif", "webp": "webp"}.get(
            match[1].lower()
        )
        if not extension or len(match[2]) > 12 * 1024 * 1024:
            return "image omitted"
        try:
            data = base64.b64decode(match[2], validate=True)
        except ValueError:
            return "image omitted"
        if hashlib.sha256(data).hexdigest() in excluded_images:
            return "image omitted"
        with Image.open(io.BytesIO(data)) as decoded:
            if decoded.width * decoded.height > 4_000_000:
                raise ValueError("Document image exceeds pixel limit")
            if decoded.width < 24 or decoded.height < 24:
                return "image omitted"
            return assets.add(decoded.convert("RGBA"))

    text = re.sub(r"data:image/([^;]+);base64,([A-Za-z0-9+/=]+)", image, text)
    text = re.sub(r"!\[[^\]\n]*\]\(image omitted\)", "", text)
    text = re.sub(r"data:[^\s)<>]+", "image omitted", text, flags=re.I)
    content = text.encode("utf-8")
    if len(content) > MAX_OUTPUT:
        raise ValueError("Converted Markdown exceeds 8 MiB")
    with open(target, "wb") as output:
        output.write(content)
    with open(target + ".json", "w") as metadata:
        json.dump({"converter": converter, **DIAGNOSTICS}, metadata)


def warm_worker():
    import gc
    import pdfplumber
    import markitdown

    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        if len(line) > 32768:
            raise ValueError("Worker request exceeds limit")
        try:
            request = json.loads(line)
            publish(request["source"], request["target"], request["library"], warm=True)
            print(json.dumps({"done": True}), flush=True)
        except Exception as error:
            print(json.dumps({"error": "Conversion failed" if not isinstance(error, ValueError) else str(error),
                              "code": getattr(error, "code", "CONVERSION_FAILED"), "type": type(error).__name__}), flush=True)
        finally:
            gc.collect()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not return source content or local paths through IPC diagnostics.
        print(
            json.dumps(
                {
                    "error": (
                        str(error)
                        if isinstance(error, ValueError)
                        else "Conversion failed"
                    ),
                    "type": type(error).__name__,
                    "code": getattr(error, "code", "CONVERSION_FAILED"),
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)
