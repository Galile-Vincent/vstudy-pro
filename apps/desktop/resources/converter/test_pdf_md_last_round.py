"""Literal regressions for the final corpus revalidation round."""

import tempfile
from pathlib import Path

import pytest
from reportlab.pdfgen import canvas
from pdf_md import (
    Block,
    Line,
    chars_to_lines,
    reading_order,
    lines_to_blocks,
    classify_blocks,
    blocks_to_markdown,
    remove_running_margins,
    convert_pdf,
)


def render(lines):
    return blocks_to_markdown(
        classify_blocks(lines_to_blocks(reading_order(lines)), 12)
    )


@pytest.mark.parametrize(
    "count, expected",
    [
        (2, "Left Left Left\n\nRight Right Right"),
        (3, "Left Left Left\n\nMiddle Middle Middle\n\nRight Right Right"),
        (
            4,
            "Left Left Left\n\nMiddle Middle Middle\n\nOther Other Other\n\nRight Right Right",
        ),
    ],
)
def test_tight_gutters_before_grouping(count, expected):
    labels = {
        2: ["Left", "Right"],
        3: ["Left", "Middle", "Right"],
        4: ["Left", "Middle", "Other", "Right"],
    }[count]
    chars = []
    for row in range(3):
        for col, label in enumerate(labels):
            for i, c in enumerate(label):
                chars.append(
                    dict(
                        text=c,
                        x0=col * 108.7 + i * 100 / len(label),
                        x1=col * 108.7 + (i + 1) * 100 / len(label),
                        top=row * 16,
                        bottom=row * 16 + 12,
                        size=12,
                    )
                )
    assert render(chars_to_lines(chars)) == expected


def test_short_side_by_side_band():
    lines = [
        Line(t, x, y, x + 80, y + 12, 12)
        for t, x, y in [
            ("Bill To", 0, 0),
            ("Ship To", 200, 0),
            ("Acme", 0, 16),
            ("Warehouse", 200, 16),
            ("Sydney", 0, 32),
            ("Newcastle", 200, 32),
        ]
    ]
    assert render(lines) == "Bill To Acme Sydney\n\nShip To Warehouse Newcastle"


def test_all_clause_markers_start_blocks():
    lines = [
        Line(t, 0, i * 16, 200, i * 16 + 12, 12)
        for i, t in enumerate(
            [
                "1.1.1 First",
                "1.1.2 Second",
                "(a) Third",
                "(b) Fourth",
                "(i) Fifth",
                "a. Sixth",
                "A. Seventh",
                "4.1 Eighth",
                "4.2 Ninth",
            ]
        )
    ]
    assert (
        render(lines)
        == "1.1.1 First\n\n1.1.2 Second\n\n(a) Third\n\n(b) Fourth\n\n(i) Fifth\n\na. Sixth\nA. Seventh\n\n4.1 Eighth\n\n4.2 Ninth"
    )


def test_missing_page_number_and_two_page_margins():
    pages = [
        [Line("1", 0, 780, 20, 792, 12)],
        [],
        [Line("3", 0, 780, 20, 792, 12)],
        [Line("4", 0, 780, 20, 792, 12)],
    ]
    assert remove_running_margins(pages, [800] * 4) == [[], [], [], []]
    pages = [
        [
            Line("Repeated header", 0, 10, 200, 22, 12),
            Line(f"Page {i} of 2", 0, 780, 200, 792, 12),
            Line("42", 0, 400, 20, 412, 12),
        ]
        for i in (1, 2)
    ]
    assert [render(p) for p in remove_running_margins(pages, [800] * 2)] == ["42", "42"]


def test_false_heading_and_size_ranks():
    lines = [
        Line(t, 0, i * 40, 200, i * 40 + size, size, bold, figure=figure)
        for i, (t, size, bold, figure) in enumerate(
            [
                ("Title", 24, False, False),
                ("1 Introduction", 16, True, False),
                ("1.2 Scope", 16, True, False),
                ("$125,875.19", 30, True, False),
                ("T", 40, True, False),
                ("Abstract", 12, True, False),
                ("Figure label", 30, True, True),
            ]
        )
    ]
    assert (
        render(lines)
        == "# Title\n\n## 1 Introduction\n\n## 1.2 Scope\n\n$125,875.19\n\nT\n\nAbstract\n\nFigure label"
    )


def pdf_fixture(draw):
    directory = tempfile.TemporaryDirectory()
    path = Path(directory.name) / "fixture.pdf"
    c = canvas.Canvas(str(path), pagesize=(612, 792))
    draw(c)
    c.save()
    return directory, path


def test_real_spaces_and_code_blank_line():
    def draw(c):
        c.setFont("Courier", 12)
        for y, t in [
            (720, "def f():"),
            (704, "    if ready:"),
            (688, "        run()"),
            (656, "    done()"),
        ]:
            c.drawString(72, y, t)

    directory, p = pdf_fixture(draw)
    with directory:
        assert (
            convert_pdf(p)
            == "<!-- page 1 -->\n\n```\ndef f():\n    if ready:\n        run()\n\n    done()\n```\n"
        )


def test_duplicate_link_uses_annotated_occurrence():
    def draw(c):
        c.setFont("Helvetica", 12)
        c.drawString(72, 720, "here then here")
        x = 72 + c.stringWidth("here then ", "Helvetica", 12)
        c.linkURL(
            "https://example.com",
            (x, 717, x + c.stringWidth("here", "Helvetica", 12), 733),
        )

    directory, p = pdf_fixture(draw)
    with directory:
        assert (
            convert_pdf(p)
            == "<!-- page 1 -->\n\nhere then [here](https://example.com)\n"
        )


def test_rotated_content_is_retained():
    def draw(c):
        c.saveState()
        c.translate(180, 100)
        c.rotate(90)
        c.setFont("Helvetica", 12)
        c.drawString(0, 0, "Rotated content belongs in the document.")
        c.drawString(0, -16, "Another rotated body line.")
        c.restoreState()

    directory, p = pdf_fixture(draw)
    with directory:
        d = {}
        assert (
            convert_pdf(p, d)
            == "<!-- page 1 -->\n\nRotated content belongs in the document. Another rotated body line.\n"
        )
        assert d["intended_removals"] == []
        assert d["loss_ratio"] == 0


def test_table_in_place():
    def draw(c):
        c.setFont("Helvetica", 12)
        c.drawString(72, 740, "Before table.")
        for x in (72, 172, 272):
            c.line(x, 640, x, 704)
        for y in (640, 672, 704):
            c.line(72, y, 272, y)
        for x, y, t in [
            (80, 684, "Name"),
            (180, 684, "Value"),
            (80, 652, "First"),
            (180, 652, "42"),
        ]:
            c.drawString(x, y, t)
        c.drawString(72, 600, "After table.")

    directory, p = pdf_fixture(draw)
    with directory:
        assert (
            convert_pdf(p)
            == "<!-- page 1 -->\n\nBefore table.\n\n| Name | Value |\n| --- | --- |\n| First | 42 |\n\nAfter table.\n"
        )


def test_background_grid_preserves_text():
    def draw(c):
        for i in range(151):
            c.line(0, i * 5, 612, i * 5)
            c.line(i * 4, 0, i * 4, 792)
        c.setFont("Helvetica", 12)
        c.drawString(72, 720, "All words on this background grid must survive.")

    directory, p = pdf_fixture(draw)
    with directory:
        assert (
            convert_pdf(p)
            == "<!-- page 1 -->\n\nAll words on this background grid must survive.\n"
        )


def test_bold_label_without_following_body_stays_plain():
    assert (
        render([Line("Isolated bold label", 0, 100, 150, 112, 12, True)])
        == "Isolated bold label"
    )
