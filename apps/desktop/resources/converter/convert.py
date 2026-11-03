"""Convert one local document; diagnostics are machine-readable JSON."""
import json
import os
import sys
import zipfile

MAX_OUTPUT = 8 * 1024 * 1024


def main():
    if len(sys.argv) != 3:
        raise ValueError("Usage: convert.py <input> <output.md>")
    source, target = sys.argv[1:]
    # Office/EPUB containers can expand far beyond their on-disk size.
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(e.file_size for e in entries) > 200 * 1024 * 1024:
                raise ValueError("Document archive exceeds expansion limit")
    from markitdown import MarkItDown
    # DOCX images otherwise become empty Markdown destinations and lose their embedded bytes.
    result = MarkItDown(enable_plugins=False).convert_local(source, keep_data_uris=True)
    content = result.text_content.encode("utf-8")
    if len(content) > MAX_OUTPUT:
        raise ValueError("Converted Markdown exceeds 8 MiB")
    with open(target, "wb") as output:
        output.write(content)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not return source content or local paths through IPC diagnostics.
        print(json.dumps({"error": "Conversion failed", "type": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
