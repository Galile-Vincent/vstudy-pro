import importlib.util
import json
from pathlib import Path
import pytest
from reportlab.pdfgen.canvas import Canvas

spec = importlib.util.spec_from_file_location("render_page", Path(__file__).with_name("render_page.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_render_bounded_page(tmp_path):
    source = tmp_path / "page.pdf"
    canvas = Canvas(str(source), pagesize=(10000, 10000))
    canvas.drawString(100, 5000, "Bounded page 2468")
    canvas.save()
    output = tmp_path / "page.png"
    module.render(str(source), 1, str(output))
    from PIL import Image
    with Image.open(output) as image:
        assert max(image.size) <= 2400
        assert image.width * image.height <= 4000000
    assert output.stat().st_size < 8 * 1024 * 1024
    assert "Bounded page 2468" in json.loads(Path(str(output) + ".json").read_text())["text"]
    with pytest.raises(ValueError, match="PAGE_RANGE"):
        module.render(str(source), 2, str(output))
