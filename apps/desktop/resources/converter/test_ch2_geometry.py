import json
from pathlib import Path
from pdf_md import chars_to_lines, preservation

FIXTURES = Path(__file__).parents[2] / 'test-fixtures' / 'pdf_md'


def test_ch2_superscripts():
    chars = json.loads((FIXTURES / 'ch2-p10-glyphs.json').read_text())
    lines = chars_to_lines(chars)
    assert [line.text for line in lines] == [
        '∆= (1.6 × 10${}^{6}$)/(54 × 10${}^{6}$) = 0.02963𝑠𝑒𝑐'
    ]
    assert chars_to_lines(list(reversed(chars))) == lines
    preservation('1.6 × 106', '1.6 × 10${}^{6}$', '', {})


def test_ch2_visual_math_line():
    chars = json.loads((FIXTURES / 'ch2-p16-glyphs.json').read_text())
    assert [line.text for line in chars_to_lines(chars)] == [
        'aggregate rate = 𝑟${}_{𝑖}$ + ∑${}_{𝑗<>𝑖}$ 𝑟${}_{𝑗}$ = 𝑢${}_{𝑠}$',
    ]
