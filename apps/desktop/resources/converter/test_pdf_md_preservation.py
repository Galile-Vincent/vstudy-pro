import pytest
from pdf_md import tokens, preservation, ContentLoss


def test_unicode_loss_is_visible():
    assert dict(tokens("한국어 日本語 カナ русский Ελληνικά العربية עברית")) == {
        "한": 1,
        "국": 1,
        "어": 1,
        "日": 1,
        "本": 1,
        "語": 1,
        "カ": 1,
        "ナ": 1,
        "русский": 1,
        "ελληνικά": 1,
        "العربية": 1,
        "עברית": 1,
    }
    d = {}
    with pytest.raises(ContentLoss):
        preservation("한국어", "English", "", d)
    assert d == {"loss_ratio": 1.0, "missing_tokens": 3, "source_tokens": 3}


def test_vector_stream_can_exceed_old_decompression_limit():
    import zlib
    import pdfminer.pdftypes as types
    from pdf_md import extraction_limits

    raw = b"%" * (24 * 1024 * 1024)
    with extraction_limits():
        assert len(types.zlib.decompress(zlib.compress(raw))) == 24 * 1024 * 1024
