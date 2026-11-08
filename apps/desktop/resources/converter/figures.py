"""Bounded document figures and page-local markdown insertion."""
from collections import Counter
from dataclasses import dataclass
import hashlib
import io
import math
from pathlib import Path
import re

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_ASSET_BYTES = 64 * 1024 * 1024
MAX_PIXELS = 4_000_000


@dataclass(frozen=True)
class Figure:
    page: int
    name: str
    alt: str


class FigureAssets:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700, exist_ok=True)
        self.names = set()
        self.size = 0

    def add(self, image):
        scale = min(1, 2400 / max(image.size), math.sqrt(MAX_PIXELS / (image.width * image.height)))
        image.thumbnail((max(1, int(image.width * scale)), max(1, int(image.height * scale))))
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        data = stream.getvalue()
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError("Document image exceeds size limit")
        name = "image-" + hashlib.sha256(data).hexdigest() + ".png"
        if name not in self.names:
            if self.size + len(data) > MAX_ASSET_BYTES:
                raise ValueError("Document images exceed size limit")
            path = self.directory / name
            if path.exists():
                if path.is_symlink() or path.read_bytes() != data:
                    raise ValueError("Invalid staged image")
            else:
                with path.open("xb") as output:
                    output.write(data)
            path.chmod(0o600)
            self.names.add(name)
            self.size += len(data)
        return name


def insert_figures(markdown, figures):
    by_page = {}
    for figure in figures:
        by_page.setdefault(figure.page, []).append(f"![{figure.alt}]({figure.name})")
    if not re.search(r"<!--\s*page\s+\d+\s*-->", markdown):
        links = [link for page_links in by_page.values() for link in page_links]
        return markdown.rstrip() + "\n\n" + "\n\n".join(links) + "\n" if links else markdown
    parts = re.split(r"(<!--\s*page\s+\d+\s*-->)", markdown)
    for index in range(1, len(parts), 2):
        page = int(re.search(r"\d+", parts[index])[0])
        if page in by_page:
            parts[index + 1] = parts[index + 1].rstrip() + "\n\n" + "\n\n".join(by_page[page]) + "\n\n"
    return "".join(parts)


def pdf_figures(source, assets):
    import pypdfium2 as pdfium
    from pypdfium2 import raw

    with pdfium.PdfDocument(source) as document:
        if len(document) > 1000:
            raise ValueError("PDF exceeds 1000-page limit")
        pages = []
        repeated = Counter()
        for page in document:
            width, height = page.get_size()
            if not (0 < width <= 100000 and 0 < height <= 100000):
                raise ValueError("Invalid PDF page size")
            objects = []
            for obj in page.get_objects(filter=[raw.FPDF_PAGEOBJ_IMAGE, raw.FPDF_PAGEOBJ_PATH]):
                left, bottom, right, top = obj.get_bounds()
                area = max(0, right - left) * max(0, top - bottom)
                meaningful = (right - left >= 12 and top - bottom >= 12 and area >= 400)
                if obj.type == raw.FPDF_PAGEOBJ_PATH:
                    meaningful = meaningful or max(right - left, top - bottom) >= 40
                if not meaningful or area > width * height * 0.9:
                    continue
                identity = hashlib.sha256(obj.get_data()).hexdigest() if obj.type == raw.FPDF_PAGEOBJ_IMAGE else None
                key = (obj.type, identity, *(round(v / 2) for v in (left, bottom, right, top)))
                objects.append((obj.type, (left, bottom, right, top), key))
                if len(objects) > 20000:
                    raise ValueError("PDF figure complexity exceeds limit")
            pages.append(objects)
            repeated.update(set(o[2] for o in objects))
            page.close()
        figures = []
        for number, objects in enumerate(pages, 1):
            page = document[number - 1]
            try:
                width, height = page.get_size()
                objects = [o for o in objects if not (
                    len(pages) >= 3 and repeated[o[2]] > max(2, len(pages) / 2)
                    and (o[0] == raw.FPDF_PAGEOBJ_PATH or (o[1][2] - o[1][0]) * (o[1][3] - o[1][1]) < width * height * 0.1)
                )]
                if not objects:
                    continue
                scale = min(120 / 72, 2400 / max(width, height), math.sqrt(MAX_PIXELS / (width * height)))
                bitmap = page.render(scale=scale)
                try:
                    with bitmap.to_pil() as image:
                        if page.get_rotation() == 0:
                            left = max(0, min(o[1][0] for o in objects) - 4)
                            top = max(0, height - max(o[1][3] for o in objects) - 4)
                            right = min(width, max(o[1][2] for o in objects) + 4)
                            bottom = min(height, height - min(o[1][1] for o in objects) + 4)
                            with image.crop((int(left * scale), int(top * scale), math.ceil(right * scale), math.ceil(bottom * scale))) as region:
                                name = assets.add(region)
                        else:
                            name = assets.add(image)
                    figures.append(Figure(number, name, f"Page {number} figure"))
                finally:
                    bitmap.close()
            finally:
                page.close()
        return figures


def preserve_figures(source, markdown, assets):
    if Path(source).suffix.lower() == ".pdf":
        markdown = re.sub(r"\[Embedded images omitted: \d+\]", "", markdown)
        return insert_figures(markdown, pdf_figures(source, assets))
    if Path(source).suffix.lower() == ".pptx":
        return re.sub(r"<!-- Slide number: (\d+) -->", r"<!-- page \1 -->", markdown)
    return markdown


def decorative_images(source):
    if Path(source).suffix.lower() != ".pptx":
        return set()
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    presentation = Presentation(source)
    area = presentation.slide_width * presentation.slide_height
    occurrences = Counter()
    small = set()
    excluded = set()

    def pictures(shapes):
        for shape in shapes:
            if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
                yield from pictures(shape.shapes)
            elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                yield shape

    for slide in presentation.slides:
        seen = set()
        for shape in pictures(slide.shapes):
            digest = hashlib.sha256(shape.image.blob).hexdigest()
            seen.add(digest)
            ratio = shape.width * shape.height / area
            if ratio > 0.9:
                excluded.add(digest)
            elif ratio < 0.1:
                small.add(digest)
        occurrences.update(seen)
    return excluded | {digest for digest in small if occurrences[digest] >= 3 and occurrences[digest] > len(presentation.slides) / 2}
