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
                {"converter": "markitdown"},
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
        note = Line("margin label", 80, 51, 140, 60, 9)
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


if __name__ == "__main__":
    unittest.main()
