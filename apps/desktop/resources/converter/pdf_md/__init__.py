"""Deterministic geometry-first PDF extraction. No alignment-inferred tables."""

from collections import Counter
from dataclasses import dataclass, replace
from statistics import median
import re


class NoTextLayer(ValueError):
    code = "NO_TEXT_LAYER"


@dataclass(frozen=True)
class Line:
    text: str
    x0: float
    top: float
    x1: float
    bottom: float
    size: float
    bold: bool = False
    note: bool = False
    math: bool = False


@dataclass(frozen=True)
class Block:
    lines: tuple[Line, ...]
    kind: str = "paragraph"
    level: int = 0


def cjk(char):
    return bool(re.match(r"[\u2e80-\u9fff\uf900-\ufaff]", char))


def join_text(left, right):
    if not left or not right:
        return left + right
    return (
        left.rstrip()
        + ("" if cjk(left[-1]) and cjk(right[0]) else " ")
        + right.lstrip()
    )


def normalize_line(text):
    text = re.sub(r"(?<=[\u2e80-\u9fff]) +(?=[\u2e80-\u9fff])", "", text.strip())
    text = re.sub(r"([\u3400-\u9fff])([A-Za-z0-9])", r"\1 \2", text)
    return re.sub(r"([A-Za-z0-9])([\u3400-\u9fff])", r"\1 \2", text)


def chars_to_lines(chars):
    groups = []
    for char in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        if not char["text"]:
            continue
        group = next(
            (
                g
                for g in reversed(groups)
                if abs(g[0]["top"] - char["top"]) < max(2, char["size"] * 0.22)
                and g[0].get("annotation", False) == char.get("annotation", False)
            ),
            None,
        )
        if group is None:
            group = []
            groups.append(group)
        group.append(char)
    result = []
    for group in groups:
        # Wide gutters separate columns even when their baselines coincide.
        runs = [[]]
        for char in sorted(group, key=lambda c: c["x0"]):
            if runs[-1] and char["x0"] - runs[-1][-1]["x1"] > char["size"] * 2.5:
                runs.append([])
            runs[-1].append(char)
        for run in runs:
            text = ""
            previous = None
            for char in run:
                if previous and char["x0"] - previous["x1"] > char["size"] * 0.18:
                    text = join_text(text, char["text"])
                else:
                    text += char["text"]
                previous = char
            size = median(c["size"] for c in run)
            result.append(
                Line(
                    normalize_line(text),
                    min(c["x0"] for c in run),
                    min(c["top"] for c in run),
                    max(c["x1"] for c in run),
                    max(c["bottom"] for c in run),
                    size,
                    sum("bold" in c.get("fontname", "").lower() for c in run)
                    > len(run) * 0.7,
                    any(c.get("annotation", False) for c in run),
                    any("math" in c.get("fontname", "").lower() for c in run),
                )
            )
    return sorted(result, key=lambda l: (l.top, l.x0))


def mark_annotations(lines):
    if not lines:
        return []
    long_lines = [l for l in lines if len(l.text) > 35 and not l.math]
    left = median(l.x0 for l in long_lines) if long_lines else min(l.x0 for l in lines)
    right = median(l.x1 for l in long_lines) if long_lines else max(l.x1 for l in lines)

    def overlap(a, b):
        return (
            min(a.x1, b.x1) > max(a.x0, b.x0)
            and min(a.bottom, b.bottom) - max(a.top, b.top) > min(a.size, b.size) * 0.35
        )

    def candidate(line):
        # Fractions, subscripts, and equation labels overlap by design.
        if line.math or re.search(r"[=≥≤∑∫\U0001d400-\U0001d7ff]", line.text):
            return False
        if any(o.math and overlap(line, o) for o in lines):
            return False
        return 4 <= len(line.text) < 30 or (
            2 <= len(line.text) < 30 and any(cjk(c) for c in line.text)
        )

    return [
        replace(
            l,
            note=(l.note and len(l.text) < 60)
            or (
                candidate(l)
                and (
                    l.x0 < left - 35
                    or l.x0 > right + 35
                    or any(
                        o is not l
                        and not o.note
                        and not o.math
                        and len(o.text) > 30
                        and overlap(l, o)
                        for o in lines
                    )
                )
            ),
        )
        for l in lines
    ]


MARKER = re.compile(r"^(?:[•●▪*-]|\d+[.)])\s+")
SUBQUESTION = re.compile(r"^[a-z][.)]\s+")
QUESTION = re.compile(r"^[RP]\d+[.．:]?\s*")
TERMINAL = re.compile(r"[.!?。！？:：;；]$")


def reading_order(lines):
    flow = [l for l in lines if not l.note]
    if len(flow) >= 4:
        middle = (min(l.x0 for l in flow) + max(l.x1 for l in flow)) / 2
        left = [l for l in flow if l.x1 < middle - 15]
        right = [l for l in flow if l.x0 > middle + 15]
        if len(left) >= 2 and len(right) >= 2 and len(left) + len(right) == len(flow):
            return (
                sorted(left, key=lambda l: l.top)
                + sorted(right, key=lambda l: l.top)
                + [l for l in lines if l.note]
            )
    return lines


def lines_to_blocks(lines):
    blocks = []
    notes = [Block((line,), "note") for line in lines if line.note]
    for line in lines:
        if line.note:
            continue
        previous = blocks[-1] if blocks else None
        if (
            previous
            and previous.kind == "paragraph"
            and not MARKER.match(line.text)
            and not QUESTION.match(line.text)
            and not SUBQUESTION.match(line.text)
            and 0 <= line.top - previous.lines[-1].bottom < line.size * 1.1
            and abs(line.x0 - previous.lines[-1].x0) <= line.size * 1.6
            and abs(line.size - previous.lines[-1].size) < 1
        ):
            blocks[-1] = replace(previous, lines=previous.lines + (line,))
        else:
            blocks.append(Block((line,)))
    return blocks + notes


def is_heading(block, body_size):
    line = block.lines[0]
    return (
        block.kind != "note"
        and len(block.lines) <= 2
        and (
            line.size > body_size * 1.18
            or (line.bold and line.size > body_size * 1.05 and len(line.text) >= 8)
        )
    )


def classify_blocks(blocks, body_size, heading_sizes=None):
    sizes = heading_sizes or sorted(
        {round(b.lines[0].size, 1) for b in blocks if is_heading(b, body_size)},
        reverse=True,
    )
    result = []
    for i, block in enumerate(blocks):
        line = block.lines[0]
        kind, level = block.kind, 0
        if kind != "note":
            if is_heading(block, body_size):
                kind, level = "heading", min(4, sizes.index(round(line.size, 1)) + 1)
            elif MARKER.match(line.text):
                neighbors = [
                    blocks[j].lines[0]
                    for j in (i - 1, i + 1)
                    if 0 <= j < len(blocks) and blocks[j].kind != "note"
                ]
                if any(
                    MARKER.match(n.text)
                    and abs(n.x0 - line.x0) < 3
                    and abs(n.top - line.top) < line.size * 2.5
                    for n in neighbors
                ):
                    kind = "list"
        result.append(replace(block, kind=kind, level=level))
    return result


def literal(text):
    text = text.replace("\\", "\\\\").replace("|", "\\|")
    text = re.sub(r"([`*_\[\]<])", r"\\\1", text)
    text = re.sub(r"^([>#+-])(?=\s|$)", r"\\\1", text)
    return re.sub(r"^(\d+)([.)])\s", r"\1\\\2 ", text)


def blocks_to_markdown(blocks):
    entries = []
    notes = []
    for block in blocks:
        text = ""
        for line in block.lines:
            text = join_text(text, line.text)
        if block.kind == "note":
            notes.append((block.lines[0].top, "> note: " + literal(text)))
            continue
        if block.kind == "table":
            rendered = text
        elif block.kind == "heading":
            rendered = "#" * block.level + " " + literal(text)
        elif block.kind == "list":
            marker = MARKER.match(text)
            rendered = (
                marker[0] + literal(text[marker.end() :])
                if text[0].isdigit()
                else "- " + literal(text[marker.end() :])
            )
        else:
            rendered = literal(text)
        entries.append([block.lines[-1].bottom, rendered, block.kind])
    for top, note in notes:
        if entries:
            nearest = min(range(len(entries)), key=lambda i: abs(entries[i][0] - top))
            entries[nearest][1] += "\n\n" + note
        else:
            entries.append([top, note, "note"])
    output = ""
    for i, (_, rendered, kind) in enumerate(entries):
        output += (
            "\n" if i and kind == entries[i - 1][2] == "list" else "\n\n" if i else ""
        ) + rendered
    return output


def remove_running_margins(pages, heights):
    counts = Counter()
    for lines, height in zip(pages, heights):
        counts.update(
            {
                (l.text, round(l.top / 4))
                for l in lines
                if l.top < height * 0.1 or l.bottom > height * 0.9
            }
        )
    return [
        [
            l
            for l in lines
            if not re.fullmatch(r"\s*[-–]?\s*\d+\s*[-–]?\s*", l.text)
            and not (
                len(pages) >= 3 and counts[(l.text, round(l.top / 4))] > len(pages) / 2
            )
        ]
        for lines in pages
    ]


def ruled_tables(page):
    tables = []
    # pdfplumber's lines strategy requires actual edges; text never supplies an edge.
    for table in page.find_tables(
        {"vertical_strategy": "lines", "horizontal_strategy": "lines"}
    ):
        rows = table.extract()
        if (
            len(rows) < 2
            or min(map(len, rows)) < 2
            or any(c is None for r in table.rows for c in r.cells)
        ):
            continue
        rendered = [
            "| " + " | ".join(literal((c or "").replace("\n", " ")) for c in row) + " |"
            for row in rows
        ]
        rendered.insert(1, "| " + " | ".join("---" for _ in rows[0]) + " |")
        tables.append((table.bbox, "\n".join(rendered)))
    return tables


def convert_pdf(path):
    import pdfplumber

    pages, heights, tables, images = [], [], [], []
    text_chars = 0
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chars = page.dedupe_chars().chars
            text_chars += sum(len(c["text"].strip()) for c in chars)
            # Annotation fonts are a separate text layer on many digitally marked worksheets.
            chars = [
                dict(
                    c,
                    annotation=bool(
                        re.search(r"kai|hand|script", c.get("fontname", ""), re.I)
                    ),
                )
                for c in chars
            ]
            grids = ruled_tables(page)
            chars = [
                c
                for c in chars
                if not any(
                    b[0] <= c["x0"] < b[2] and b[1] <= c["top"] < b[3] for b, _ in grids
                )
            ]
            lines = mark_annotations(chars_to_lines(chars))
            for annotation in page.annots:
                if annotation.get("contents") and getattr(
                    annotation["data"].get("Subtype"), "name", ""
                ) in ("FreeText", "Text"):
                    lines.append(
                        Line(
                            annotation["contents"].replace("\n", " "),
                            annotation["x0"],
                            annotation["top"],
                            annotation["x1"],
                            annotation["bottom"],
                            11,
                            note=True,
                        )
                    )
            pages.append(sorted(lines, key=lambda l: (l.top, l.x0)))
            heights.append(page.height)
            tables.append(grids)
            images.append(len(page.images))
        if text_chars < 12:
            raise NoTextLayer("no text layer; OCR not supported yet")
        pages = remove_running_margins(pages, heights)
        body = (
            median(l.size for p in pages for l in p if not l.note)
            if any(not l.note for p in pages for l in p)
            else 12
        )
        page_blocks = [lines_to_blocks(reading_order(lines)) for lines in pages]
        heading_sizes = sorted(
            {
                round(b.lines[0].size, 1)
                for blocks in page_blocks
                for b in blocks
                if is_heading(b, body)
            },
            reverse=True,
        )
        output = []
        previous = None
        for n, unclassified in enumerate(page_blocks):
            blocks = classify_blocks(unclassified, body, heading_sizes)
            for bbox, text in tables[n]:
                blocks.append(Block((Line(text, *bbox, body),), "table"))
            blocks.sort(key=lambda b: (b.lines[0].top, b.lines[0].x0))
            text = blocks_to_markdown(blocks)
            first = next((b for b in blocks if b.kind != "note"), None)
            # Keep the page marker inside the continuing paragraph: HTML comments render invisibly.
            continuing = (
                previous
                and first
                and previous.kind == first.kind == "paragraph"
                and not TERMINAL.search(previous.lines[-1].text)
                and not QUESTION.match(first.lines[0].text)
                and not MARKER.match(first.lines[0].text)
            )
            marker = f"<!-- page {n+1} -->"
            output.append(
                (" " + marker + "\n" if continuing else "\n\n" + marker + "\n\n") + text
            )
            if images[n]:
                output[-1] += f"\n\n[Embedded images omitted: {images[n]}]"
            previous = next((b for b in reversed(blocks) if b.kind != "note"), None)
    return "".join(output).lstrip() + "\n"
