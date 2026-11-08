import os
from pathlib import Path
import re

import pytest
from PIL import Image
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader

from figures import Figure, FigureAssets, insert_figures, preserve_figures
from convert import publish


def test_page_insertion():
    markdown = '<!-- page 1 -->\n\nOne\n\n<!-- page 2 -->\n\nTwo\n'
    result = insert_figures(markdown, [Figure(2, 'image-hash.png', 'Page 2 figure')])
    assert result.index('<!-- page 2 -->') < result.index('![Page 2 figure]')
    assert result.count('image-hash.png') == 1
    assert 'One' in result and 'Two' in result


def test_vector_raster_and_template_filtering(tmp_path):
    source = tmp_path / 'figures.pdf'
    canvas = Canvas(str(source), pagesize=(600, 800))
    for number in range(4):
        canvas.drawString(40, 750, f'Text on page {number + 1}')
        canvas.rect(10, 10, 30, 30, fill=1)
        if number == 1:
            canvas.rect(150, 300, 200, 100)
            canvas.line(150, 350, 350, 350)
        if number == 2:
            image = Image.new('RGB', (200, 100), 'red')
            canvas.drawImage(ImageReader(image), 150, 300, 200, 100)
        canvas.showPage()
    canvas.save()
    assets = FigureAssets(tmp_path / 'assets')
    markdown = ''.join(f'<!-- page {i} -->\n\nText\n\n' for i in range(1, 5))
    result = preserve_figures(source, markdown, assets)
    assert '![Page 2 figure]' in result
    assert '![Page 3 figure]' in result
    assert '![Page 1 figure]' not in result
    assert '![Page 4 figure]' not in result
    assert len(assets.names) == 2


def test_hash_dedupe_and_pixel_cap(tmp_path):
    assets = FigureAssets(tmp_path / 'assets')
    image = Image.new('RGB', (3000, 2000), 'red')
    first = assets.add(image)
    assert assets.add(image) == first
    assert len(list((tmp_path / 'assets').iterdir())) == 1
    with Image.open(tmp_path / 'assets' / first) as decoded:
        assert max(decoded.size) <= 2400


def test_office_embedded_images(tmp_path):
    from pptx import Presentation
    from pptx.util import Inches
    from docx import Document

    image = tmp_path / 'figure.png'
    Image.new('RGB', (200, 100), 'blue').save(image)
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    slide.shapes.add_picture(str(image), Inches(1), Inches(1))
    presentation.save(tmp_path / 'input.pptx')
    document = Document()
    document.add_paragraph('Figure description')
    document.add_picture(str(image))
    document.save(tmp_path / 'input.docx')
    for extension in ('pptx', 'docx'):
        target = tmp_path / (extension + '.md')
        publish(str(tmp_path / ('input.' + extension)), str(target), str(target), warm=True)
        text = target.read_text()
        assert re.search(r'!\[[^]]*\]\(image-[a-f0-9]{64}\.png\)', text)
        assert 'data:image' not in text
        assert len(list(Path(str(target) + '.assets').glob('*.png'))) == 1


@pytest.mark.skipif(not os.environ.get('VSTUDY_FIGURE_PDF'), reason='Set VSTUDY_FIGURE_PDF to the OS Introduction fixture')
def test_os_introduction_fixture(tmp_path):
    source = os.environ['VSTUDY_FIGURE_PDF']
    target = tmp_path / 'content.md'
    publish(source, str(target), str(target), warm=True)
    markdown = target.read_text()
    assets_before = sorted(Path(str(target) + '.assets').glob('*.png'))
    publish(source, str(target), str(target), warm=True)
    assert target.read_text() == markdown
    assert sorted(Path(str(target) + '.assets').glob('*.png')) == assets_before
    pages = re.split(r'<!-- page \d+ -->', markdown)
    for number in (2, 5, 11, 20, 21):
        match = re.search(r'!\[Page \d+ figure\]\((image-[a-f0-9]{64}\.png)\)', pages[number])
        assert match, f'Missing figure on slide {number}'
        with Image.open(Path(str(target) + '.assets') / match[1]) as image:
            assert image.width > 100 and image.height > 100


def test_pptx_skips_backgrounds_and_repeated_small_art(tmp_path):
    from pptx import Presentation
    from pptx.util import Inches
    from figures import decorative_images
    import hashlib

    image = tmp_path / 'logo.png'
    Image.new('RGB', (100, 100), 'green').save(image)
    deck = Presentation()
    for _ in range(4):
        slide = deck.slides.add_slide(deck.slide_layouts[6])
        slide.shapes.add_picture(str(image), 0, 0, Inches(0.3), Inches(0.3))
    source = tmp_path / 'deck.pptx'
    deck.save(source)
    assert hashlib.sha256(image.read_bytes()).hexdigest() in decorative_images(source)
