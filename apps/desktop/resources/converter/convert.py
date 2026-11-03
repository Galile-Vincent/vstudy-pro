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


def convert_document(source, isolated=False):
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
            return convert_pdf(source, DIAGNOSTICS), "pdf_md"
        except (PasswordProtected, ResourceLimit):
            raise
        except NoTextLayer:
            no_text = True
        except Exception as error:
            DIAGNOSTICS["fallback_code"] = getattr(
                error, "code", "PDF_EXTRACTION_FAILED"
            )
    try:
        if isolated and os.path.splitext(source)[1].lower() == ".pdf":
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
    import resource
    import threading
    import time

    def monitor_memory():
        while True:
            rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            if sys.platform != "darwin":
                rss *= 1024
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
    if len(sys.argv) != 4:
        raise ValueError("Usage: convert.py <input> <output.md> <library.md>")
    source, target, library_target = sys.argv[1:]
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
    text, converter = convert_document(source, isolated=True)

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
        name = "image-" + hashlib.sha256(data).hexdigest() + "." + extension
        with open(os.path.join(os.path.dirname(library_target), name), "wb") as asset:
            asset.write(data)
        return name

    text = re.sub(r"data:image/([^;]+);base64,([A-Za-z0-9+/=]+)", image, text)
    text = re.sub(r"data:[^\s)<>]+", "image omitted", text, flags=re.I)
    content = text.encode("utf-8")
    if len(content) > MAX_OUTPUT:
        raise ValueError("Converted Markdown exceeds 8 MiB")
    with open(target, "wb") as output:
        output.write(content)
    with open(target + ".json", "w") as metadata:
        json.dump({"converter": converter, **DIAGNOSTICS}, metadata)


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
