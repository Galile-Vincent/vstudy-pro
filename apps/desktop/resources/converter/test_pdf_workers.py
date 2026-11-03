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
