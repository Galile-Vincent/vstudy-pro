"""Dev only: uv run --with pdfplumber==0.11.9 --with 'markitdown[all]==0.1.9' --with pymupdf4llm python scripts/pdf-compare.py PDF --output-dir /tmp/pdf-comparison."""

import argparse
from pathlib import Path
import re
import sys
import time

sys.path.insert(
    0, str(Path(__file__).resolve().parents[1] / "apps/desktop/resources/converter")
)
from pdf_md import convert_pdf


def metrics(text):
    return [
        len(text),
        len(re.findall(r"^#{1,6} ", text, re.M)),
        len(re.findall(r"^\|", text, re.M)),
        len(re.findall(r"^\s*(?:\d+\.|[-*]) ", text, re.M)),
        len(re.findall(r"^> note:", text, re.M)),
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--output-dir", type=Path, default=Path("/tmp/pdf-comparison"))
    args = parser.parse_args()
    from markitdown import MarkItDown
    import pymupdf4llm

    args.output_dir.mkdir(parents=True, exist_ok=True)
    print("parser                 chars headings table-rows lists notes seconds")
    for name, run in [
        ("pdf_md", lambda: convert_pdf(args.pdf)),
        (
            "markitdown",
            lambda: MarkItDown(enable_plugins=False)
            .convert_local(args.pdf)
            .text_content,
        ),
        ("pymupdf4llm", lambda: pymupdf4llm.to_markdown(args.pdf)),
    ]:
        start = time.monotonic()
        try:
            text = run()
            (args.output_dir / (name + ".md")).write_text(text)
            print(
                f"{name:20} "
                + " ".join(f"{n:7}" for n in metrics(text))
                + f" {time.monotonic()-start:.2f}",
                flush=True,
            )
        except Exception as error:
            print(f"{name}: {type(error).__name__}: {error}", flush=True)


if __name__ == "__main__":
    main()
