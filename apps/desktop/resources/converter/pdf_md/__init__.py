"""Deterministic geometry-first PDF extraction. No alignment-inferred tables."""

from collections import Counter
from dataclasses import dataclass, replace
from statistics import median
import re
import html
import unicodedata
import signal
from contextlib import contextmanager


class ContentLoss(ValueError):
    code = "CONTENT_LOSS"


class ExtractionTimeout(ValueError):
    code = "PDF_TIME_LIMIT"


class ResourceLimit(ValueError):
    code = "PDF_RESOURCE_LIMIT"


class PasswordProtected(ValueError):
    code = "PASSWORD_PROTECTED"


def tokens(text):
    text = unicodedata.normalize("NFKC", html.unescape(text)).lower()
    words, word = [], ""
    for char in text:
        if cjk(char) or "\uac00" <= char <= "\ud7af" or "\u3040" <= char <= "\u30ff":
            if word:
                words.append(word)
                word = ""
            words.append(char)
        elif unicodedata.category(char)[0] in "LN" or (
            word and unicodedata.category(char)[0] == "M"
        ):
            word += char
        else:
            if word:
                words.append(word)
                word = ""
    if word:
        words.append(word)
    return Counter(words)


def preservation(source, output, removed, diagnostics):
    expected = tokens(re.sub(r"\(cid:\d+\)", "", source)) - tokens(removed)
    actual = tokens(re.sub(r"<!-- page \d+ -->|> note:|\(cid:\d+\)", "", output))
    missing = sum((expected - actual).values())
    ratio = missing / max(1, sum(expected.values()))
    diagnostics.update(
        loss_ratio=ratio, missing_tokens=missing, source_tokens=sum(expected.values())
    )
    if not output.strip() or not actual or ratio > 0.03:
        raise ContentLoss("PDF extraction lost source content")


@contextmanager
def extraction_limits(seconds=72, stream_bytes=64 * 1024 * 1024):
    import pdfminer.pdftypes as types
    import zlib

    from pdfminer.converter import PDFLayoutAnalyzer

    original_path = PDFLayoutAnalyzer.paint_path

    def bounded_path(device, *args, **kwargs):
        count = getattr(device, "_pdf_md_paths", 0)
        device._pdf_md_paths = count + 1
        # Background maps/grids must not allocate millions of layout edge objects.
        # Text extraction continues; uncertain geometry falls back to plain text.
        if count < 20000:
            return original_path(device, *args, **kwargs)

    PDFLayoutAnalyzer.paint_path = bounded_path
    original = types.zlib

    class BoundedZlib:
        error = zlib.error

        @staticmethod
        def decompress(data):
            decoder = zlib.decompressobj()
            result = decoder.decompress(data, stream_bytes + 1)
            if len(result) > stream_bytes or decoder.unconsumed_tail:
                raise ResourceLimit("PDF stream exceeds decompression limit")
            return result

    def expired(*_):
        raise ExtractionTimeout("PDF extraction time budget exceeded")

    old_handler = signal.signal(signal.SIGALRM, expired)
    types.zlib = BoundedZlib
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_handler)
        types.zlib = original
        PDFLayoutAnalyzer.paint_path = original_path


def dedupe_chars(chars):
    buckets = {}
    result = []
    for c in chars:
        x, y = round(c["x0"]), round(c["top"])
        key = (c["text"], c.get("fontname"), round(c["size"], 1))
        duplicate = any(
            abs(c["x0"] - o["x0"]) <= 0.5 and abs(c["top"] - o["top"]) <= 0.5
            for dx in (-1, 0, 1)
            for dy in (-1, 0, 1)
            for o in buckets.get((key, x + dx, y + dy), ())
        )
        if not duplicate:
            result.append(c)
            buckets.setdefault((key, x, y), []).append(c)
    return result


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
    mono: bool = False
    links: tuple = ()
    columns: tuple = ()


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
        + (
            ""
            if cjk(left[-1]) and cjk(right[0]) or "\uff00" <= left[-1] <= "\uffef"
            else " "
        )
        + right.lstrip()
    )


def normalize_line(text):
    text = re.sub(r"^\s*\(cid:\d+\)\s*", "• ", text)
    text = re.sub(r"(?<=[\u2e80-\u9fff]) +(?=[\u2e80-\u9fff])", "", text.strip())
    text = re.sub(r"([\u3400-\u9fff])([A-Za-z0-9])", r"\1 \2", text)
    return re.sub(r"([A-Za-z0-9])([\u3400-\u9fff])", r"\1 \2", text)


def char_links(chars):
    links, group, uri = [], [], None
    for char in chars:
        if char.get("url") != uri:
            if uri:
                links.append((normalize_line("".join(group)), uri))
            group, uri = [], char.get("url")
        group.append(char["text"])
    if uri:
        links.append((normalize_line("".join(group)), uri))
    return tuple(links)


def chars_to_lines(chars):
    groups = []
    buckets = {}
    for char in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        if not char["text"]:
            continue
        group = next(
            (
                g
                for bucket in range(
                    int(char["top"] // 4) - 2, int(char["top"] // 4) + 3
                )
                for g in buckets.get(bucket, ())
                if abs(g[0]["top"] - char["top"]) < max(2, char["size"] * 0.22)
                and g[0].get("annotation", False) == char.get("annotation", False)
            ),
            None,
        )
        if group is None:
            group = []
            groups.append(group)
            buckets.setdefault(int(char["top"] // 4), []).append(group)
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
                    all(
                        re.search(r"mono|courier|consol", c.get("fontname", ""), re.I)
                        for c in run
                    ),
                    links=char_links(run),
                )
            )
    return sorted(result, key=lambda l: (l.top, l.x0))


def mark_annotations(lines, figure_regions=()):
    buckets = {}
    for line in lines:
        for row in range(int(line.top // 24), int(line.bottom // 24) + 1):
            buckets.setdefault(row, []).append(line)
    merged = {}
    consumed = set()
    for line in lines:
        if len(line.text) > 3 or line.note or line.bold:
            continue
        for row in range(int(line.top // 24) - 1, int(line.bottom // 24) + 2):
            for other in buckets.get(row, ()):
                if (
                    other is not line
                    and id(other) not in consumed
                    and not other.note
                    and len(other.text) > 3
                    and line.size < other.size * 0.85
                    and abs(line.bottom - other.bottom) <= other.size * 0.4
                    and 0 <= line.x0 - other.x1 < other.size * 0.8
                ):
                    base = merged.get(id(other), other)
                    merged[id(other)] = replace(
                        base, text=base.text + line.text, x1=line.x1
                    )
                    consumed.add(id(line))
                    break
            if id(line) in consumed:
                break
    result = []
    for original in lines:
        if id(original) in consumed:
            continue
        line = merged.get(id(original), original)
        nearby = {
            id(o): o
            for row in range(int(line.top // 24), int(line.bottom // 24) + 1)
            for o in buckets.get(row, ())
        }.values()
        note = line.note
        figure_label = any(
            x0 <= line.x0
            and line.x1 <= x1
            and top <= line.top
            and line.bottom <= bottom
            for x0, top, x1, bottom in figure_regions
        )
        for other in nearby:
            if other is line or other.note or other.math or line.math:
                continue
            area = max(0, min(line.x1, other.x1) - max(line.x0, other.x0)) * max(
                0, min(line.bottom, other.bottom) - max(line.top, other.top)
            )
            baseline = (
                abs(line.bottom - other.bottom) < max(line.size, other.size) * 0.4
            )
            if (
                (
                    4 <= len(line.text) < 30
                    or 2 <= len(line.text) < 30
                    and any(cjk(c) for c in line.text)
                )
                and not figure_label
                and len(other.text) > 35
                and not re.search(r"[+−=∑∫]", line.text)
                and not baseline
                and not line.bold
                and line.size < other.size
                and not re.match(r"^\d+[.)]", line.text)
                and area > (line.x1 - line.x0) * (line.bottom - line.top) * 0.4
            ):
                note = True
        result.append(replace(line, note=note))
    return result


MARKER = re.compile(r"^(?:[•◦●–■▪*o-]|\(cid:\d+\)|\d+[.)]|\d+(?= [A-Z]))\s+")
SUBQUESTION = re.compile(r"^[a-z][.)]\s+")
QUESTION = re.compile(r"^[RP]\d+[.．:]?\s*")
TERMINAL = re.compile(r"[.!?。！？:：;；]$")


def reading_order(lines):
    flow = sorted((l for l in lines if not l.note), key=lambda l: (l.top, l.x0))
    if not flow:
        return lines
    middle = (min(l.x0 for l in flow) + max(l.x1 for l in flow)) / 2

    def column(line):
        return 0 if line.x1 < middle - 10 else 1 if line.x0 > middle + 10 else 2

    if not any(column(l) == 0 for l in flow) or not any(column(l) == 1 for l in flow):
        return lines
    ordered, band = [], []

    def flush():
        ordered.extend(sorted(band, key=lambda l: (column(l), l.top)))
        band.clear()

    for line in flow:
        if column(line) == 2:
            flush()
            ordered.append(line)
        else:
            band.append(line)
    flush()
    return ordered + [l for l in lines if l.note]


def lines_to_blocks(lines):
    blocks = []
    gaps = [
        b.top - a.bottom
        for a, b in zip(lines, lines[1:])
        if 0 < b.top - a.bottom < a.size * 3
    ]
    gap = median(gaps) if gaps else 6
    notes = [Block((line,), "note") for line in lines if line.note]
    for line in lines:
        if line.note:
            continue
        previous = blocks[-1] if blocks else None
        if (
            previous
            and previous.kind == "paragraph"
            and not line.bold
            and not line.mono
            and not previous.lines[-1].mono
            and not previous.lines[-1].bold
            and not MARKER.match(line.text)
            and not QUESTION.match(line.text)
            and not SUBQUESTION.match(line.text)
            and 0
            <= line.top - previous.lines[-1].bottom
            < max(2, min(gap * 1.45, line.size * 1.4))
            and abs(line.x0 - previous.lines[-1].x0)
            <= line.size * (2 if MARKER.match(previous.lines[0].text) else 0.7)
            and abs(line.size - previous.lines[-1].size) < 1
        ):
            blocks[-1] = replace(previous, lines=previous.lines + (line,))
        elif (
            previous
            and line.mono
            and previous.lines[-1].mono
            and 0 <= line.top - previous.lines[-1].bottom < line.size * 2
        ):
            blocks[-1] = replace(previous, lines=previous.lines + (line,))
        else:
            blocks.append(Block((line,)))
    return blocks + notes


def is_heading(block, body_size):
    line = block.lines[0]
    return (
        block.kind != "note"
        and len(block.lines) == 1
        and len(line.text) < 120
        and not line.mono
        and (
            line.size > body_size * 1.18
            or (line.bold and line.size > body_size * 1.05 and len(line.text) >= 8)
            or (
                line.bold
                and (
                    re.match(r"^\d+(?:\.\d+)*[ .]", line.text)
                    or len(line.text) >= 12
                    and not TERMINAL.search(line.text)
                )
            )
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
            if line.mono:
                kind = "code"
            elif is_heading(block, body_size) and not (
                i
                and blocks[i - 1].kind == "paragraph"
                and not TERMINAL.search(blocks[i - 1].lines[-1].text)
                and 0 <= line.top - blocks[i - 1].lines[-1].bottom < line.size
                and abs(line.size - blocks[i - 1].lines[-1].size) < 1.5
            ):
                kind, level = "heading", min(4, sizes.index(round(line.size, 1)) + 1)
                numbering = re.match(r"^(\d+(?:\.\d+)*)[ .]", line.text)
                if numbering:
                    level = min(4, numbering[1].count(".") + 1)
            elif MARKER.match(line.text):
                neighbors = [
                    blocks[j].lines[0]
                    for j in (i - 1, i + 1)
                    if 0 <= j < len(blocks) and blocks[j].kind != "note"
                ]
                if any(
                    MARKER.match(n.text)
                    and abs(n.x0 - line.x0) < line.size * 4
                    and abs(n.top - line.top) < line.size * 2.5
                    for n in neighbors
                ):
                    kind = "list"
                    level = max(
                        0,
                        round(
                            (
                                line.x0
                                - min(
                                    b.lines[0].x0
                                    for b in blocks
                                    if MARKER.match(b.lines[0].text)
                                )
                            )
                            / (line.size * 2)
                        ),
                    )
        result.append(replace(block, kind=kind, level=level))
    return result


def literal(text):
    text = text.replace("<!--", "&lt;!--")
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
        if block.kind == "code":
            rendered = (
                "```\n"
                + "\n".join(
                    " " * max(0, round((l.x0 - block.lines[0].x0) / (l.size * 0.6)))
                    + l.text.replace("<!--", "&lt;!--")
                    for l in block.lines
                )
                + "\n```"
            )
        elif block.kind == "table":
            rendered = text
        elif block.kind == "heading":
            rendered = "#" * block.level + " " + literal(text)
        elif block.kind == "list":
            marker = MARKER.match(text)
            rendered = (
                text.split()[0].rstrip(".)") + ". " + literal(text[marker.end() :])
                if text[0].isdigit()
                else "- " + literal(text[marker.end() :])
            )
        else:
            rendered = literal(text)
        if block.kind == "list":
            rendered = "  " * block.level + rendered
        for line in block.lines:
            for label, uri in line.links:
                label = literal(label)
                rendered = rendered.replace(
                    label, "[" + label + "](" + uri.replace(")", "%29") + ")", 1
                )
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


def remove_running_margins(pages, heights, removed=None):
    counts = Counter()
    for lines, height in zip(pages, heights):
        counts.update(
            {
                (l.text, round(l.top / 4))
                for l in lines
                if l.top < height * 0.1 or l.bottom > height * 0.9
            }
        )
    result = []
    for lines, height in zip(pages, heights):
        kept = []
        for line in lines:
            margin = line.top < height * 0.1 or line.bottom > height * 0.9
            repeated = (
                len(pages) >= 3
                and counts[(line.text, round(line.top / 4))] > len(pages) / 2
            )
            numeric = re.fullmatch(r"\s*[-–]?\s*\d+\s*[-–]?\s*", line.text)
            sequence = False
            if margin and numeric and len(pages) >= 2:
                peers = [
                    l
                    for page in pages
                    for l in page
                    if re.fullmatch(r"\s*[-–]?\s*\d+\s*[-–]?\s*", l.text)
                    and abs(l.top - line.top) < 4
                ]
                numbers = [int(re.search(r"\d+", l.text)[0]) for l in peers]
                sequence = len(numbers) == len(pages) and numbers == list(
                    range(numbers[0], numbers[0] + len(pages))
                )
            if margin and (repeated or numeric and sequence):
                if removed is not None:
                    removed.append(line.text)
            else:
                kept.append(line)
        result.append(kept)
    return result


def ruled_tables(page):
    tables = []
    # pdfplumber's lines strategy requires actual edges; text never supplies an edge.
    for table in page.find_tables(
        {"vertical_strategy": "lines", "horizontal_strategy": "lines"}
    ):
        rows = table.extract()
        if len(rows) < 2 or min(map(len, rows)) < 2:
            continue
        rendered = [
            "| " + " | ".join(literal((c or "").replace("\n", " ")) for c in row) + " |"
            for row in rows
        ]
        rendered.insert(1, "| " + " | ".join("---" for _ in rows[0]) + " |")
        tables.append(
            (
                table.bbox,
                "\n".join(rendered),
                tuple(round(c.bbox[0], 1) for c in table.columns),
            )
        )
    return tables


def convert_pdf(path, diagnostics=None):
    diagnostics = diagnostics if diagnostics is not None else {}
    with extraction_limits():
        try:
            return _convert_pdf(path, diagnostics)
        except Exception as error:
            for cause in (error, error.__cause__, error.__context__):
                if isinstance(cause, (ResourceLimit, ExtractionTimeout)):
                    raise cause from None
            from pdfminer.pdfdocument import PDFPasswordIncorrect

            if (
                isinstance(error, PDFPasswordIncorrect)
                or isinstance(error.__cause__, PDFPasswordIncorrect)
                or isinstance(error.__context__, PDFPasswordIncorrect)
            ):
                raise PasswordProtected("Password-protected PDF") from None
            raise


def _convert_pdf(path, diagnostics):
    import pdfplumber

    pages, heights, tables, images = [], [], [], []
    text_chars = 0
    raw_text = []
    removed = []
    with pdfplumber.open(path) as pdf:
        if len(pdf.pages) > 1000:
            raise ResourceLimit("PDF exceeds 1000-page limit")
        for page in pdf.pages:
            chars = dedupe_chars(page.chars)

            # A tiny stamp does not turn a scanned page into a useful text layer.
            count = sum(len(c["text"].strip()) for c in chars)
            scan = count < 40 and any(
                (im["x1"] - im["x0"]) * (im["bottom"] - im["top"])
                > page.width * page.height * 0.8
                for im in page.images
            )
            text_chars += 0 if scan else count
            if page.rotation:
                rotated = []
                for c in chars:
                    x0, x1, y0, y1 = c["x0"], c["x1"], c["top"], c["bottom"]
                    if page.rotation == 90:
                        box = (y0, page.width - x1, y1, page.width - x0)
                    elif page.rotation == 180:
                        box = (
                            page.width - x1,
                            page.height - y1,
                            page.width - x0,
                            page.height - y0,
                        )
                    else:
                        box = (page.height - y1, x0, page.height - y0, x1)
                    a, b, cc, d, e, f = c.get(
                        "matrix", (1, 0, 0, 1, x0, page.height - y1)
                    )
                    if page.rotation == 90:
                        matrix = (-b, a, -d, cc, page.height - f, e)
                    elif page.rotation == 180:
                        matrix = (-a, -b, -cc, -d, page.width - e, page.height - f)
                    else:
                        matrix = (b, -a, d, -cc, f, page.width - e)
                    rotated.append(
                        dict(
                            c,
                            x0=box[0],
                            top=box[1],
                            x1=box[2],
                            bottom=box[3],
                            size=box[3] - box[1],
                            matrix=matrix,
                            upright=abs(matrix[1]) < abs(matrix[0]),
                        )
                    )
                chars = rotated
            else:
                stamps = [
                    c
                    for c in chars
                    if not c.get("upright", True)
                    and (c["x0"] < page.width * 0.1 or c["x1"] > page.width * 0.9)
                ]
                stamp_text = "".join(c["text"] for c in stamps)
                raw_text.append(stamp_text)
                removed.append(stamp_text)
                stamp_ids = {id(c) for c in stamps}
                chars = [c for c in chars if id(c) not in stamp_ids]
            from pdfplumber.utils import extract_text

            raw_text.append(extract_text(chars, x_tolerance_ratio=0.18) or "")
            # Font names alone are not evidence of an annotation.
            chars = [
                dict(
                    c,
                    annotation=False,
                )
                for c in chars
            ]
            for annotation in page.annots:
                uri = annotation.get("uri")
                if uri:
                    for c in chars:
                        if (
                            annotation["x0"] <= c["x0"] <= annotation["x1"]
                            and annotation["top"] <= c["top"] <= annotation["bottom"]
                        ):
                            c["url"] = uri
            grids = ruled_tables(page)
            chars = [
                c
                for c in chars
                if not any(
                    b[0] <= c["x0"] < b[2] and b[1] <= c["top"] < b[3]
                    for b, _, _ in grids
                )
            ]
            lines = chars_to_lines(chars)
            regions = [
                (im["x0"], im["top"], im["x1"], im["bottom"]) for im in page.images
            ]
            drawings = page.rects + page.curves
            if len(drawings) >= 3:
                region = (
                    min(d["x0"] for d in drawings),
                    min(d["top"] for d in drawings),
                    max(d["x1"] for d in drawings),
                    max(d["bottom"] for d in drawings),
                )
                if (
                    sum(
                        len(l.text) < 30
                        and region[0] <= l.x0
                        and l.x1 <= region[2]
                        and region[1] <= l.top
                        and l.bottom <= region[3]
                        for l in lines
                    )
                    >= 3
                ):
                    regions.append(region)
            lines = mark_annotations(lines, regions)
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
            page.flush_cache()
        if text_chars == 0:
            raise NoTextLayer("no text layer; OCR not supported yet")
        pages = remove_running_margins(pages, heights, removed)
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
            for bbox, text, columns in tables[n]:
                blocks.append(
                    Block((Line(text, *bbox, body, columns=columns),), "table")
                )
            if tables[n]:
                blocks = [
                    b
                    for line in reading_order([b.lines[0] for b in blocks])
                    for b in blocks
                    if b.lines[0] is line
                ]
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
                and not SUBQUESTION.match(first.lines[0].text)
                and not first.lines[0].mono
                and not first.lines[0].bold
            )
            marker = f"<!-- page {n+1} -->"
            table_join = (
                previous
                and first
                and not images[n - 1]
                and previous.kind == first.kind == "table"
                and previous.lines[0].columns == first.lines[0].columns
            )
            if table_join:
                old_rows = previous.lines[0].text.splitlines()
                new_rows = first.lines[0].text.splitlines()
                if old_rows[0] == new_rows[0]:
                    removed.append(new_rows[0])
                data = (
                    new_rows[2:]
                    if old_rows[0] == new_rows[0]
                    else [new_rows[0]] + new_rows[2:]
                )
                if data:
                    data[0] = data[0].replace("| ", "| " + marker + " ", 1)
                text = text.replace(first.lines[0].text, "\n".join(data), 1)
                output[-1] = output[-1].rstrip() + "\n" + text
            else:
                output.append(
                    (" " + marker + "\n" if continuing else "\n\n" + marker + "\n\n")
                    + text
                )
            if images[n]:
                output[-1] += f"\n\n[Embedded images omitted: {images[n]}]"
            previous = next((b for b in reversed(blocks) if b.kind != "note"), None)
    result = "".join(output).lstrip() + "\n"
    diagnostics["intended_removals"] = removed
    preservation("\n".join(raw_text), result, "\n".join(removed), diagnostics)
    return result
