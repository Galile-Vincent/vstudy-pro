"""Dev only: uvx --with pypdf --with fonttools --with pdfplumber python -I scripts/pdf-fixture.py SOURCE.pdf.

Preserve page 3's text and annotation contents; discard editor state and appearance
streams, and subset embedded fonts with stable glyph IDs to bound fixture size.
"""

from io import BytesIO
from pathlib import Path
import sys
from pypdf import PdfReader, PdfWriter
from fontTools import subset
from fontTools.ttLib import TTFont
import pdfplumber

source = PdfReader(sys.argv[1])
page = source.pages[2]
seen = set()


def clean(obj):
    obj = obj.get_object()
    if id(obj) in seen:
        return
    seen.add(id(obj))
    if isinstance(obj, dict):
        for key in list(obj):
            if str(key).startswith("/AAPL:") or key == "/AP":
                del obj[key]
            elif key != "/Parent":
                clean(obj[key])
    elif isinstance(obj, list):
        for value in obj:
            clean(value)


clean(page)
writer = PdfWriter()
writer.add_page(page)
writer.compress_identical_objects()
buffer = BytesIO()
writer.write(buffer)
buffer.seek(0)
chars = "".join(c["text"] for c in pdfplumber.open(buffer).pages[0].chars)
buffer.seek(0)
reader = PdfReader(buffer)
for index in range(1, reader.trailer["/Size"]):
    obj = reader.get_object(index)
    if hasattr(obj, "get_data") and "/Length1" in obj:
        font = TTFont(BytesIO(obj.get_data()))
        options = subset.Options()
        options.retain_gids = True
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(text=chars)
        subsetter.subset(font)
        data = BytesIO()
        font.save(data)
        obj.set_data(data.getvalue())
writer = PdfWriter()
writer.add_page(reader.pages[0])
writer.pages[0].compress_content_streams()
writer.compress_identical_objects()
target = (
    Path(__file__).resolve().parents[1]
    / "apps/desktop/test-fixtures/pdf_md/ch2-page3.pdf"
)
writer.write(target)
assert target.stat().st_size < 300 * 1024
print(target, target.stat().st_size)
