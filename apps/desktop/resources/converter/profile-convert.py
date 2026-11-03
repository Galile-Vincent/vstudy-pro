"""Local-only profile; input PDFs and outputs stay outside the checkout."""
import cProfile
import hashlib
import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
rows = {}
for name in ['pdfminer', 'pdfplumber', 'markitdown']:
    start = time.perf_counter()
    subprocess.run([sys.executable, '-c', f'import {name}'], check=True)
    cold = time.perf_counter() - start
    start = time.perf_counter()
    importlib.import_module(name)
    first = time.perf_counter() - start
    start = time.perf_counter()
    importlib.import_module(name)
    rows[name] = {'spawn_import_s': cold, 'in_process_import_s': first,
                  'cached_import_s': time.perf_counter() - start}
from reportlab.pdfgen.canvas import Canvas
pdf = output / '100-pages.pdf'
c = Canvas(str(pdf))
for page in range(100):
    for line in range(40):
        c.drawString(45, 790-line*18, f'Page {page+1}, line {line}: A reproducible text document for conversion profiling.')
    c.showPage()
c.save()
subprocess.run([sys.executable, str(Path(__file__).parents[2] / 'test-fixtures/converter/generate.py'), str(output)], check=True)
from pdf_md import convert_pdf
for label, path in [('ch2', source), ('100-pages', pdf), ('docx', output/'sample.docx'), ('xlsx', output/'sample.xlsx')]:
    target = output / f'{label}.md'
    start = time.perf_counter()
    subprocess.run([sys.executable, str(Path(__file__).with_name('convert.py')), str(path), str(target), str(target)], check=True)
    rows[label] = {'cli_s': time.perf_counter()-start, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    if path.suffix == '.pdf':
        profile = cProfile.Profile()
        start = time.perf_counter()
        profile.runcall(convert_pdf, str(path))
        rows[label]['profiled_extraction_s'] = time.perf_counter()-start
        profile.dump_stats(str(output/f'{label}.pstats'))
        import pstats
        with (output/f'{label}-profile.txt').open('w') as f:
            pstats.Stats(profile, stream=f).sort_stats('cumulative').print_stats(45)
print(json.dumps(rows, indent=2))
(output/'profile.json').write_text(json.dumps(rows, indent=2))
