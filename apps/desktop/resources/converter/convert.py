"""Convert one local document; diagnostics are machine-readable JSON."""
import base64
import hashlib
import re
import json
import os
import sys
import zipfile

MAX_OUTPUT = 8 * 1024 * 1024


def main():
    if len(sys.argv) != 4:
        raise ValueError("Usage: convert.py <input> <output.md>")
    source, target, library_target = sys.argv[1:]
    # Office/EPUB containers can expand far beyond their on-disk size.
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(e.file_size for e in entries) > 200 * 1024 * 1024:
                raise ValueError("Document archive exceeds expansion limit")
    from markitdown import MarkItDown
    # DOCX images otherwise become empty Markdown destinations and lose their embedded bytes.
    result = MarkItDown(enable_plugins=False).convert_local(source, keep_data_uris=True)
    def image(match):
        extension = {"jpeg": "jpg", "png": "png", "gif": "gif", "webp": "webp"}.get(match[1].lower())
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
    text = re.sub(r"data:image/([^;]+);base64,([A-Za-z0-9+/=]+)", image, result.text_content)
    text = re.sub(r"data:[^\s)<>]+", "image omitted", text, flags=re.I)
    content = text.encode("utf-8")
    if len(content) > MAX_OUTPUT:
        raise ValueError("Converted Markdown exceeds 8 MiB")
    with open(target, "wb") as output:
        output.write(content)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not return source content or local paths through IPC diagnostics.
        print(json.dumps({"error": str(error) if isinstance(error, ValueError) else "Conversion failed", "type": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
