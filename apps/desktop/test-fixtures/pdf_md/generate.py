"""Dev only: uv run --with reportlab python generate.py."""

from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

ROOT = Path(__file__).parent
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))


def make(name, draw):
    c = canvas.Canvas(str(ROOT / (name + ".pdf")), pagesize=(600, 800), invariant=True)
    c.setFont("Helvetica", 12)
    draw(c)
    c.save()


def heading(c):
    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, 740, "Overview")
    c.setFont("Helvetica", 12)
    c.drawString(50, 700, "A body paragraph.")
    c.drawString(50, 670, "1. First item")
    c.drawString(50, 650, "2. Second item")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 610, "Important")


def table(c):
    for x in (50, 200, 350):
        c.line(x, 600, x, 700)
    for y in (600, 650, 700):
        c.line(50, y, 350, y)
    for x, y, t in (
        (60, 675, "Name"),
        (210, 675, "Value"),
        (60, 625, "A | B"),
        (210, 625, "42"),
    ):
        c.drawString(x, y, t)


def columns(c):
    for x in (50, 330):
        c.drawString(x, 700, "Left side." if x == 50 else "Right side.")
        c.drawString(x, 680, "More left." if x == 50 else "More right.")


def margins(c):
    for n in range(1, 4):
        c.setFont("Helvetica", 12)
        c.drawString(50, 770, "Running header")
        c.drawString(50, 700, f"Page body {n}.")
        c.drawString(50, 20, "Running footer")
        c.drawString(300, 40, str(n))
        c.showPage()


def split(c):
    c.drawString(50, 80, "This paragraph continues")
    c.showPage()
    c.setFont("Helvetica", 12)
    c.drawString(50, 730, "on the next page.")


def chinese(c):
    c.setFont("STSong-Light", 12)
    c.drawString(50, 700, "這是中文段落，使用 HTTP 傳送資料。")
    c.drawString(50, 680, "中文之間不加入空格。")


for name, draw in [
    ("heading-list", heading),
    ("ruled-table", table),
    ("columns", columns),
    ("margins", margins),
    ("page-split", split),
    ("cjk", chinese),
    ("no-text", lambda c: c.rect(50, 50, 100, 100)),
]:
    make(name, draw)
