"""Bounded single-page image worker with Python-level network guards."""
import json
import math
import os
import signal
import sys
from pathlib import Path


def _render(source, page_number, output):
    import pdfplumber
    import pypdfium2
    if page_number < 1:
        raise ValueError("PAGE_RANGE")
    with pypdfium2.PdfDocument(source) as document:
        if page_number > len(document):
            raise ValueError("PAGE_RANGE")
        page = document[page_number - 1]
        width, height = page.get_size()
        if not (0 < width <= 100000 and 0 < height <= 100000):
            raise ValueError("PAGE_SIZE")
        scale = min(120 / 72, 2400 / max(width, height), math.sqrt(4_000_000 / (width * height)))
        bitmap = page.render(scale=scale)
        image = bitmap.to_pil()
        temporary = str(output) + ".tmp"
        image.save(temporary, format="PNG")
        if os.path.getsize(temporary) > 8 * 1024 * 1024:
            os.unlink(temporary)
            raise ValueError("PAGE_SIZE")
        os.chmod(temporary, 0o600)
        os.replace(temporary, output)
        image.close()
        bitmap.close()
        page.close()
    with pdfplumber.open(source) as document:
        text = document.pages[page_number - 1].extract_text() or ""
    Path(str(output) + ".json").write_text(json.dumps({"text": text}), encoding="utf8")
    os.chmod(str(output) + ".json", 0o600)


def render(source, page_number, output):
    import socket
    def deny_network(*args, **kwargs):
        raise PermissionError("Converter network disabled")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    socket.create_connection = deny_network
    if hasattr(signal, "alarm"):
        signal.alarm(20)
    try:
        return _render(source, page_number, output)
    finally:
        if hasattr(signal, "alarm"):
            signal.alarm(0)


if __name__ == '__main__':
    render(sys.argv[1], int(sys.argv[2]), sys.argv[3])
