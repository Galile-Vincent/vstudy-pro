import pytest


def test_fallback_runs_with_independent_process_budget():
    from unittest.mock import patch
    from convert import convert_document, DIAGNOSTICS
    from pdf_md import ExtractionTimeout

    with patch(
        "convert.run_pdf_worker",
        side_effect=[ExtractionTimeout("deadline"), {"text": "Fallback text"}],
    ) as worker:
        assert convert_document("unused.pdf", isolated=True) == (
            "Fallback text",
            "markitdown",
        )
    assert [c.args[0] for c in worker.call_args_list] == [
        "--pdf-worker",
        "--fallback-worker",
    ]
    assert DIAGNOSTICS == {"fallback_code": "PDF_TIME_LIMIT"}


def test_timeout_code_survives_failed_fallback():
    from unittest.mock import patch
    from convert import convert_document
    from pdf_md import ExtractionTimeout

    with patch(
        "convert.run_pdf_worker",
        side_effect=[ExtractionTimeout("deadline"), ValueError("fallback failed")],
    ):
        with pytest.raises(
            ValueError, match="This PDF is too large or complex to convert"
        ) as caught:
            convert_document("unused.pdf", isolated=True)
    assert caught.value.code == "PDF_TIME_LIMIT"


def test_progressive_pages_preserve_final_markdown(tmp_path):
    from reportlab.pdfgen.canvas import Canvas
    from pdf_md import convert_pdf

    path = str(tmp_path / 'pages.pdf')
    canvas = Canvas(path)
    for n in range(7):
        canvas.drawString(40, 750, f'Unique body text on page {n+1}.')
        canvas.showPage()
    canvas.save()
    expected = convert_pdf(path)
    pages = []
    assert convert_pdf(path, on_page=lambda *args: pages.append(args)) == expected
    assert [(p, total) for p, total, _ in pages] == [(n, 7) for n in range(1, 8)]
    assert 'Unique body text' in pages[0][2]


def test_warm_worker_multiple_jobs_and_failure_recovery(tmp_path):
    import json
    import subprocess
    import sys
    from pathlib import Path
    from reportlab.pdfgen.canvas import Canvas
    from pdf_md import convert_pdf

    source = tmp_path / 'input.pdf'
    c = Canvas(str(source))
    c.drawString(40, 750, 'Warm worker preserves output and progress.')
    c.save()
    process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('convert.py')), '--warm-worker'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert json.loads(process.stdout.readline()) == {'ready': True}
        for name in ['missing.pdf', str(source), str(source)]:
            target = tmp_path / 'output.md'
            process.stdin.write(json.dumps({'source': name, 'target': str(target), 'library': str(target)})+'\n')
            process.stdin.flush()
            events = []
            while True:
                record = json.loads(process.stdout.readline())
                events.append(record)
                if record.get('done') or record.get('error'):
                    break
            if name == 'missing.pdf':
                assert events[-1].get('error')
            else:
                assert events[0]['progress'] == 'Converting page 1/1…'
                assert target.read_text() == convert_pdf(str(source))
    finally:
        process.kill()
        process.communicate(timeout=5)
