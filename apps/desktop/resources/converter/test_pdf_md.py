import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from pdf_md import (
    Line,
    Block,
    NoTextLayer,
    chars_to_lines,
    lines_to_blocks,
    classify_blocks,
    blocks_to_markdown,
    remove_running_margins,
    mark_annotations,
    convert_pdf,
)
from convert import convert_document

FIXTURES = Path(__file__).resolve().parents[2] / "test-fixtures/pdf_md"


class PdfTests(unittest.TestCase):
    def test_goldens_and_idempotence(self):
        for name in (
            "heading-list",
            "ruled-table",
            "columns",
            "margins",
            "page-split",
            "cjk",
            "ch2-page3",
            "rotated",
            "slides",
            "merged-table",
            "numbers",
            "outdented",
            "continuing-table",
        ):
            with self.subTest(name=name):
                expected = (FIXTURES / (name + ".md")).read_text()
                self.assertEqual(convert_pdf(FIXTURES / (name + ".pdf")), expected)
                self.assertEqual(convert_pdf(FIXTURES / (name + ".pdf")), expected)

    def test_worksheet(self):
        text = convert_pdf(FIXTURES / "ch2-page3.pdf")
        self.assertIn("\n\nR12. ", text)
        self.assertIn("\n\nR13. ", text)
        self.assertNotIn("|", text)
        self.assertNotRegex(text, r"(?m)^5\.")
        for label in ("控制台->程式集", "如果要使用telnet", "變成", "字符"):
            self.assertEqual(text.count(label), 1)
            self.assertIn("> note: " + label, text)

    def test_pure_stages(self):
        chars = [
            dict(text=t, x0=i * 12, x1=(i + 1) * 12, top=0, bottom=12, size=12)
            for i, t in enumerate("中文")
        ]
        lines = chars_to_lines(chars)
        self.assertEqual(lines, [Line("中文", 0, 0, 24, 12, 12)])
        blocks = lines_to_blocks(lines)
        self.assertEqual(blocks, [Block(tuple(lines))])
        self.assertEqual(classify_blocks(blocks, 12), blocks)
        self.assertEqual(blocks_to_markdown(blocks), "中文")
        self.assertEqual(remove_running_margins([lines] * 3, [800] * 3), [[], [], []])

    def test_no_text_and_corrupt_fallback(self):
        with self.assertRaisesRegex(
            NoTextLayer, "no text layer; OCR not supported yet"
        ):
            convert_document(str(FIXTURES / "no-text.pdf"))
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "corrupt.pdf"
            source.write_bytes(b"%PDF-1.4\ncorrupt")
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("convert.py")),
                    str(source),
                    str(source) + ".md",
                    str(source) + ".md",
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            import json

            self.assertEqual(
                json.loads(Path(str(source) + ".md.json").read_text()),
                {"converter": "markitdown", "fallback_code": "PDF_EXTRACTION_FAILED"},
            )
            self.assertEqual(Path(str(source) + ".md").read_text(), "%PDF-1.4\ncorrupt")

    def test_structured_no_text_error(self):
        import json

        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory) / "content.md")
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("convert.py")),
                    str(FIXTURES / "no-text.pdf"),
                    target,
                    target,
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            error = json.loads(result.stderr.strip().splitlines()[-1])
            self.assertEqual(error["code"], "NO_TEXT_LAYER")
            self.assertEqual(error["error"], "no text layer; OCR not supported yet")

    def test_annotation_geometry(self):
        body = Line(
            "A long paragraph of ordinary body text underneath.", 50, 50, 400, 62, 12
        )
        note = Line("margin label", 80, 49, 140, 57, 9)
        result = mark_annotations([body, note])
        self.assertFalse(result[0].note)
        self.assertTrue(result[1].note)
        self.assertEqual(
            blocks_to_markdown(classify_blocks(lines_to_blocks(result), 12)),
            body.text + "\n\n> note: margin label",
        )

    def test_heading_ranks_and_inline_highlight(self):
        blocks = [
            Block((Line(text, 0, i * 30, 100, i * 30 + size, size, bold),))
            for i, (text, size, bold) in enumerate(
                [("Title", 24, False), ("Subtitle", 14, True), ("Important", 12, True)]
            )
        ]
        self.assertEqual(
            blocks_to_markdown(classify_blocks(blocks, 12)),
            "# Title\n\n## Subtitle\n\nImportant",
        )

    def test_single_marker_stays_literal(self):
        blocks = [Block((Line("- isolated highlight", 0, 0, 100, 12, 12),))]
        self.assertEqual(
            blocks_to_markdown(classify_blocks(blocks, 12)), r"\- isolated highlight"
        )

    def test_math_is_not_an_annotation(self):
        body = Line(
            "A long paragraph of ordinary body text underneath.", 50, 50, 400, 62, 12
        )
        equation = Line("𝑥 + 𝑦", 80, 51, 140, 60, 9, math=True)
        self.assertFalse(any(l.note for l in mark_annotations([body, equation])))

    def test_pdf_routes_to_pdf_md(self):
        text, parser = convert_document(str(FIXTURES / "heading-list.pdf"))
        self.assertEqual(parser, "pdf_md")
        self.assertEqual(text, (FIXTURES / "heading-list.md").read_text())


class SafeguardTests(unittest.TestCase):
    def test_preservation_and_loss_diagnostics(self):
        from pdf_md import preservation, ContentLoss

        diagnostics = {}
        preservation("中文 42 words", "<!-- page 1 -->\n中文 42 words", "", diagnostics)
        self.assertEqual(
            diagnostics, {"loss_ratio": 0.0, "missing_tokens": 0, "source_tokens": 4}
        )
        with self.assertRaisesRegex(ContentLoss, "PDF extraction lost source content"):
            preservation("42 7 2024", "<!-- page 1 -->", "", diagnostics)
        self.assertEqual(
            diagnostics, {"loss_ratio": 1.0, "missing_tokens": 3, "source_tokens": 3}
        )

    def test_stream_limit(self):
        import zlib
        import pdfminer.pdftypes as types
        from pdf_md import extraction_limits, ResourceLimit

        with extraction_limits(stream_bytes=100):
            with self.assertRaisesRegex(
                ResourceLimit, "PDF stream exceeds decompression limit"
            ):
                types.zlib.decompress(zlib.compress(b"%" * 101))

    def test_numbers_inside_body_survive(self):
        pages = [
            [
                Line(t, 10, 200 + i * 40, 50, 212 + i * 40, 12)
                for i, t in enumerate(("42", "7", "2024"))
            ]
        ]
        self.assertEqual(
            blocks_to_markdown(
                lines_to_blocks(remove_running_margins(pages, [800])[0])
            ),
            "42\n\n7\n\n2024",
        )


class LayoutRegressionTests(unittest.TestCase):
    def test_banded_columns_literal_order(self):
        from pdf_md import reading_order

        lines = [
            Line("Title", 0, 0, 400, 20, 20),
            Line("Left one.", 0, 30, 150, 42, 12),
            Line("Right one.", 250, 30, 400, 42, 12),
            Line("Left two.", 0, 50, 150, 62, 12),
            Line("Right two.", 250, 50, 400, 62, 12),
            Line("Full width separator.", 0, 80, 400, 92, 12),
            Line("Left three.", 0, 110, 150, 122, 12),
            Line("Right three.", 250, 110, 400, 122, 12),
        ]
        self.assertEqual(
            blocks_to_markdown(lines_to_blocks(reading_order(lines))),
            "Title\n\nLeft one. Left two.\n\nRight one. Right two.\n\nFull width separator.\n\nLeft three.\n\nRight three.",
        )

    def test_outdented_title_and_math_stay_in_flow(self):
        lines = [
            Line("Network Security Overview", 0, 0, 500, 44, 44, True),
            Line(
                "Body sentence with sufficient words to establish ordinary text.",
                50,
                100,
                500,
                112,
                12,
            ),
            Line("2", 501, 99, 506, 105, 6),
        ]
        self.assertEqual(
            blocks_to_markdown(
                classify_blocks(lines_to_blocks(mark_annotations(lines)), 12)
            ),
            "# Network Security Overview\n\nBody sentence with sufficient words to establish ordinary text.\n\n2",
        )

    def test_comment_literal_and_cjk_spacing(self):
        from pdf_md import literal, join_text

        self.assertEqual(literal("<!-- page 999 -->"), "&lt;!-- page 999 -->")
        self.assertEqual(join_text("你好，", "世界"), "你好，世界")
        self.assertEqual(
            blocks_to_markdown(
                [Block((Line("第一　章", 0, 0, 100, 24, 24),), "heading", 1)]
            ),
            "# 第一　章",
        )

    def test_bullets_nested_and_numbered(self):
        lines = [
            Line(t, x, i * 18, 200, i * 18 + 12, 12)
            for i, (t, x) in enumerate(
                [
                    (" First", 10),
                    ("◦ Nested", 34),
                    ("(cid:127) Last", 10),
                    ("1 Step one", 10),
                    ("2 Step two", 10),
                ]
            )
        ]
        self.assertEqual(
            blocks_to_markdown(classify_blocks(lines_to_blocks(lines), 12)),
            "- First\n  - Nested\n- Last\n1. Step one\n2. Step two",
        )

    def test_monospaced_newlines(self):
        lines = [
            Line("if ready:", 10, 10, 100, 22, 12, mono=True),
            Line("run()", 24.4, 25, 100, 37, 12, mono=True),
        ]
        self.assertEqual(
            blocks_to_markdown(classify_blocks(lines_to_blocks(lines), 12)),
            "```\nif ready:\n  run()\n```",
        )


class HostilePdfTests(unittest.TestCase):
    def test_bomb_is_rejected_before_fallback(self):
        from pdf_md import ResourceLimit

        with self.assertRaisesRegex(
            ResourceLimit, "PDF stream exceeds decompression limit"
        ):
            convert_document(str(FIXTURES / "stream-bomb.pdf"))

    def test_600_pages_are_preserved(self):
        text = convert_pdf(FIXTURES / "600-pages.pdf")
        self.assertEqual(text.count("A small page of preserved document text."), 600)
        self.assertEqual(
            text.split("<!-- page 600 -->")[1],
            "\n\nA small page of preserved document text.\n",
        )

    def test_numbers_and_rotation_fall_back_on_loss(self):
        from unittest.mock import patch

        for name in ("numbers", "rotated"):
            with self.subTest(name=name), patch(
                "pdf_md.blocks_to_markdown", return_value=""
            ):
                text, parser = convert_document(str(FIXTURES / (name + ".pdf")))
                self.assertEqual(parser, "markitdown")
                self.assertIn("42" if name == "numbers" else "Lorem ipsum", text)

    def test_password_is_structured(self):
        from pdf_md import PasswordProtected

        with self.assertRaisesRegex(PasswordProtected, "Password-protected PDF"):
            convert_document(str(FIXTURES / "password.pdf"))


class AdditionalRegressionTests(unittest.TestCase):
    def test_superscript_is_inline(self):
        lines = [Line("E=mc", 10, 10, 50, 22, 12), Line("2", 51, 12, 55, 18, 6)]
        self.assertEqual(
            blocks_to_markdown(lines_to_blocks(mark_annotations(lines))), "E=mc2"
        )

    def test_dense_page_requests_fallback(self):
        from pdf_md import ContentLoss

        with self.assertRaisesRegex(ContentLoss, "PDF extraction lost source content"):
            convert_pdf(FIXTURES / "dense.pdf")

    def test_link_rectangle_preserves_target(self):
        self.assertEqual(
            convert_pdf(FIXTURES / "link.pdf"),
            "<!-- page 1 -->\n\nVisit [Example](https://example.com) for useful documentation.\n",
        )

    def test_scan_stamp_is_not_a_text_layer(self):
        with self.assertRaisesRegex(
            NoTextLayer, "no text layer; OCR not supported yet"
        ):
            convert_document(str(FIXTURES / "scan-stamp.pdf"))

    def test_time_budget_interrupts_work(self):
        from pdf_md import extraction_limits, ExtractionTimeout

        with self.assertRaisesRegex(
            ExtractionTimeout, "PDF extraction time budget exceeded"
        ):
            with extraction_limits(seconds=0.001):
                while True:
                    pass

    def test_subquestion_page_break(self):
        self.assertEqual(
            convert_pdf(FIXTURES / "subquestion-break.pdf"),
            "<!-- page 1 -->\n\nAn unfinished answer continues\n\n<!-- page 2 -->\n\na. A new subquestion starts here.\n",
        )

    def test_page_limit_is_structured(self):
        from unittest.mock import patch, MagicMock
        from pdf_md import ResourceLimit

        fake = MagicMock()
        fake.__enter__.return_value.pages = [None] * 1001
        with patch("pdfplumber.open", return_value=fake):
            with self.assertRaisesRegex(ResourceLimit, "PDF exceeds 1000-page limit"):
                convert_pdf("unused.pdf")

    def test_figure_label_stays_plain(self):
        body = Line(
            "A long paragraph of ordinary body text underneath.", 50, 50, 400, 62, 12
        )
        label = Line("Label", 80, 49, 140, 57, 9)
        result = mark_annotations([body, label], [(40, 40, 410, 70)])
        self.assertEqual(
            blocks_to_markdown(lines_to_blocks(result)), body.text + "\n\nLabel"
        )


if __name__ == "__main__":
    unittest.main()
