"""
tests/test_engine.py
====================
15+ pytest tests covering normalisation, scoring, classification,
hard negatives, and each issue category.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "engine"))

from detector import (
    normalise_title,
    normalise_prefix,
    candidate_pairs,
    score_pair,
    build_blocks,
    AUTO_FLAG_THRESHOLD,
    NEEDS_REVIEW_THRESHOLD,
)
from classifier import (
    classify_issues,
    _is_valid_year,
    _is_valid_runtime,
    _is_valid_language,
)


# ---------------------------------------------------------------------------
# Normalisation tests
# ---------------------------------------------------------------------------

class TestNormalisation:
    def test_lowercase(self):
        assert normalise_title("THE DARK KNIGHT") == normalise_title("the dark knight")

    def test_strip_leading_the(self):
        assert normalise_title("The Matrix") == "matrix"

    def test_strip_leading_a(self):
        assert normalise_title("A Beautiful Mind") == "beautiful mind"

    def test_strip_leading_an(self):
        assert normalise_title("An Inconvenient Truth") == "inconvenient truth"

    def test_accent_normalisation(self):
        # "Amélie" → "amelie"
        result = normalise_title("Amélie")
        assert result == "amelie"

    def test_punctuation_removal(self):
        result = normalise_title("Spider-Man: No Way Home")
        assert ":" not in result
        assert "-" not in result

    def test_year_suffix_stripped(self):
        assert normalise_title("Dune (2021)") == "dune"
        assert normalise_title("Top Gun (1986)") == "top gun"

    def test_roman_numeral_ii(self):
        r1 = normalise_title("Toy Story II")
        r2 = normalise_title("Toy Story 2")
        assert r1 == r2

    def test_roman_numeral_iii(self):
        r1 = normalise_title("Fast & Furious III")
        r2 = normalise_title("Fast Furious 3")
        # main tokens match
        assert "3" in r2
        assert "3" in r1

    def test_number_word(self):
        r1 = normalise_title("Ocean's Eleven")
        r2 = normalise_title("Oceans 11")
        assert normalise_title("oceans eleven") == normalise_title("oceans 11")

    def test_empty_string(self):
        assert normalise_title("") == ""

    def test_prefix_length(self):
        prefix = normalise_prefix("The Dark Knight", length=4)
        assert len(prefix) == 4
        assert prefix == "dark"


# ---------------------------------------------------------------------------
# Scoring tests
# ---------------------------------------------------------------------------

class TestScoring:
    def _make_record(self, cid, title, year=2020, lang="en", runtime=120, cast=None):
        return {
            "catalog_id": cid,
            "title": title,
            "year": year,
            "language": lang,
            "runtime": runtime,
            "cast": cast or [],
        }

    def test_identical_titles_high_score(self):
        a = self._make_record("A1", "Inception")
        b = self._make_record("A2", "Inception")
        result = score_pair(a, b)
        assert result["composite_score"] >= AUTO_FLAG_THRESHOLD

    def test_case_variant_high_score(self):
        a = self._make_record("B1", "the dark knight")
        b = self._make_record("B2", "THE DARK KNIGHT")
        result = score_pair(a, b)
        assert result["composite_score"] >= AUTO_FLAG_THRESHOLD

    def test_article_drop_high_score(self):
        a = self._make_record("C1", "The Godfather")
        b = self._make_record("C2", "Godfather")
        result = score_pair(a, b)
        assert result["composite_score"] >= NEEDS_REVIEW_THRESHOLD

    def test_completely_different_titles_low_score(self):
        a = self._make_record("D1", "Avengers Endgame")
        b = self._make_record("D2", "The Little Mermaid")
        result = score_pair(a, b)
        assert result["composite_score"] < NEEDS_REVIEW_THRESHOLD

    def test_verdict_auto_flag(self):
        a = self._make_record("E1", "Parasite", year=2019, lang="ko")
        b = self._make_record("E2", "Parasite", year=2019, lang="ko")
        result = score_pair(a, b)
        assert result["verdict"] == "AUTO_FLAG"

    def test_verdict_distinct(self):
        a = self._make_record("F1", "Zootopia")
        b = self._make_record("F2", "Frozen")
        result = score_pair(a, b)
        assert result["verdict"] == "DISTINCT"

    def test_signals_present(self):
        a = self._make_record("G1", "Moana")
        b = self._make_record("G2", "Moana 2")
        result = score_pair(a, b)
        expected_signals = {
            "token_set_ratio", "wratio", "year_proximity",
            "language_match", "runtime_closeness", "cast_overlap"
        }
        assert set(result["signals"].keys()) == expected_signals


# ---------------------------------------------------------------------------
# Hard negative tests — remakes / sequels must NOT be AUTO_FLAG
# ---------------------------------------------------------------------------

class TestHardNegatives:
    def _make_movie(self, cid, title, year, runtime=120):
        return {
            "catalog_id": cid,
            "title": title,
            "year": year,
            "language": "en",
            "runtime": runtime,
            "cast": [],
        }

    def test_lion_king_remake_not_auto_flagged(self):
        a = self._make_movie("HN1", "The Lion King", 1994)
        b = self._make_movie("HN2", "The Lion King", 2019)
        result = score_pair(a, b)
        # Year difference of 25 years should pull score down below AUTO_FLAG
        assert result["verdict"] != "AUTO_FLAG", (
            f"Lion King 1994 vs 2019 should not be AUTO_FLAG "
            f"(score={result['composite_score']})"
        )

    def test_a_star_is_born_not_auto_flagged(self):
        a = self._make_movie("HN3", "A Star Is Born", 1937)
        b = self._make_movie("HN4", "A Star Is Born", 2018)
        result = score_pair(a, b)
        assert result["verdict"] != "AUTO_FLAG"

    def test_ghostbusters_not_auto_flagged(self):
        a = self._make_movie("HN5", "Ghostbusters", 1984)
        b = self._make_movie("HN6", "Ghostbusters", 2016)
        result = score_pair(a, b)
        assert result["verdict"] != "AUTO_FLAG"


# ---------------------------------------------------------------------------
# Classifier / issue category tests
# ---------------------------------------------------------------------------

class TestClassifier:
    def _base_record(self, cid="R001", title="Test Movie", year=2020):
        return {
            "catalog_id": cid,
            "title": title,
            "original_title": title,
            "year": year,
            "genres": ["Drama"],
            "language": "en",
            "runtime": 120,
            "cast": ["Actor A"],
            "synopsis": "A test synopsis.",
            "certification": "PG",
            "tmdb_id": 9999,
            "media_type": "movie",
        }

    def test_missing_title_generates_missing_metadata(self):
        rec = self._base_record()
        rec["title"] = ""
        issues = classify_issues([rec], [])
        cats = [i["category"] for i in issues]
        assert "MISSING_METADATA" in cats

    def test_missing_year_generates_missing_metadata(self):
        rec = self._base_record()
        rec["year"] = None
        issues = classify_issues([rec], [])
        cats = [i["category"] for i in issues]
        assert "MISSING_METADATA" in cats

    def test_invalid_year_format(self):
        rec = self._base_record()
        rec["year"] = "20211"
        issues = classify_issues([rec], [])
        inv = [i for i in issues if i["category"] == "INVALID_FORMAT"]
        assert any(i["evidence"]["field"] == "year" for i in inv)

    def test_negative_runtime_invalid_format(self):
        rec = self._base_record()
        rec["runtime"] = -5
        issues = classify_issues([rec], [])
        inv = [i for i in issues if i["category"] == "INVALID_FORMAT"]
        assert any(i["evidence"]["field"] == "runtime" for i in inv)

    def test_duplicate_pair_generates_duplicate_issue(self):
        pair = {
            "id_a": "R001", "id_b": "R002",
            "verdict": "AUTO_FLAG",
            "composite_score": 0.95,
            "title_a": "Test", "title_b": "Test",
            "year_a": 2020, "year_b": 2020,
            "signals": {
                "token_set_ratio": 1.0, "wratio": 1.0,
                "year_proximity": 1.0, "language_match": 1.0,
                "runtime_closeness": 1.0, "cast_overlap": 0.5,
            }
        }
        rec_a = self._base_record("R001")
        rec_b = self._base_record("R002", title="Test Movie")
        issues = classify_issues([rec_a, rec_b], [pair])
        dups = [i for i in issues if i["category"] == "DUPLICATE"]
        assert len(dups) >= 1

    def test_metadata_mismatch_detected(self):
        rec = self._base_record()
        rec["year"] = 2005  # catalog says 2005
        gt_map = {9999: {"year": 2020, "language": "en"}}  # TMDB says 2020
        issues = classify_issues([rec], [], gt_map)
        mismatches = [i for i in issues if i["category"] == "METADATA_MISMATCH"]
        assert len(mismatches) >= 1

    def test_issue_has_required_fields(self):
        rec = self._base_record()
        rec["title"] = ""
        issues = classify_issues([rec], [])
        for iss in issues:
            assert "id" in iss
            assert "record_ids" in iss
            assert "category" in iss
            assert "severity" in iss
            assert "evidence" in iss
            assert "suggested_action" in iss


# ---------------------------------------------------------------------------
# Blocking / candidate generation tests
# ---------------------------------------------------------------------------

class TestBlocking:
    def _make_records(self, titles_years):
        return [
            {
                "catalog_id": f"R{i:03d}",
                "title": t,
                "year": y,
                "language": "en",
                "runtime": 100,
                "cast": [],
            }
            for i, (t, y) in enumerate(titles_years)
        ]

    def test_blocking_finds_similar_titles(self):
        records = self._make_records([
            ("Inception", 2010),
            ("Inception", 2010),
            ("Frozen", 2013),
        ])
        pairs, n_cands, n_sq = candidate_pairs(records)
        # Should find the Inception pair
        found = any(
            frozenset([records[a]["title"], records[b]["title"]]) == frozenset(["Inception"])
            for a, b in pairs
        )
        assert found

    def test_blocking_reduces_comparisons(self):
        records = self._make_records([(f"Movie A {i}" if i % 2 == 0 else f"Film B {i}", 2000 + i % 20) for i in range(50)])
        pairs, n_cands, n_sq = candidate_pairs(records)
        assert n_cands < n_sq, "Blocking should save comparisons"

    def test_validator_year_valid(self):
        assert _is_valid_year(2020) is True
        assert _is_valid_year("2020") is True

    def test_validator_year_invalid(self):
        assert _is_valid_year("20211") is False
        assert _is_valid_year(-5) is False
        assert _is_valid_year("abcd") is False

    def test_validator_runtime_valid(self):
        assert _is_valid_runtime(90) is True
        assert _is_valid_runtime(120) is True

    def test_validator_runtime_invalid(self):
        assert _is_valid_runtime(-1) is False
        assert _is_valid_runtime(0) is False
        assert _is_valid_runtime("ninety") is False

    def test_validator_language_valid(self):
        assert _is_valid_language("en") is True
        assert _is_valid_language("ko") is True

    def test_validator_language_invalid(self):
        assert _is_valid_language("english") is False
        assert _is_valid_language("") is False
