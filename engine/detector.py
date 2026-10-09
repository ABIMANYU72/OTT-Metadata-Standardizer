"""
detector.py
===========
Phase 2: Normalise → Block → Score → Classify pairs.
Outputs pair_scores and summary metrics. Never reads seeded_labels.json.
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
CATALOG_FILE = DATA_DIR / "catalog.json"

# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

ARTICLES = re.compile(r"^(the|a|an)\s+", re.I)

ROMAN_NUMERALS = {
    "viii": "8", "vii": "7", "vi": "6", "iv": "4",
    "iii": "3", "ii": "2", "ix": "9", "xi": "11",
    "xii": "12", "xiii": "13", "xiv": "14", "xv": "15",
    "i": "1", "v": "5", "x": "10",
}

NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12",
}

PUNCT_RE = re.compile(r"[^\w\s]")
MULTI_SPACE = re.compile(r"\s+")
YEAR_SUFFIX_RE = re.compile(r"\s*\(\d{4}\)\s*$")


def normalise_title(title: str) -> str:
    """
    Full normalisation pipeline:
    1. Strip year suffix like (2021)
    2. Lower-case
    3. Decompose Unicode accents and strip combining chars
    4. Remove punctuation
    5. Strip leading articles (the/a/an)
    6. Replace roman numerals with digits
    7. Replace number words with digits
    8. Collapse whitespace / strip
    """
    if not title:
        return ""

    t = YEAR_SUFFIX_RE.sub("", title)
    t = t.lower()

    # Decompose accents
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")

    t = PUNCT_RE.sub(" ", t)
    t = MULTI_SPACE.sub(" ", t).strip()

    # Strip leading articles
    t = ARTICLES.sub("", t).strip()

    # Roman numerals (whole word)
    words = t.split()
    new_words = []
    for w in words:
        new_words.append(ROMAN_NUMERALS.get(w, w))
    t = " ".join(new_words)

    # Number words
    words = t.split()
    new_words = []
    for w in words:
        new_words.append(NUMBER_WORDS.get(w, w))
    t = " ".join(new_words)

    return t.strip()


def normalise_prefix(title: str, length: int = 4) -> str:
    """Return first `length` chars of normalised title for blocking."""
    nt = normalise_title(title)
    return nt[:length] if len(nt) >= length else nt


# ---------------------------------------------------------------------------
# Blocking
# ---------------------------------------------------------------------------

def build_blocks(records: list[dict]) -> dict[str, list[int]]:
    """
    Build inverted index: block_key → list of record indices.
    Keys: normalised_prefix_4 and optionally year-bucketed variant.
    """
    blocks: dict[str, list[int]] = defaultdict(list)
    for idx, rec in enumerate(records):
        title = rec.get("title", "")
        prefix = normalise_prefix(title)
        if prefix:
            blocks[prefix].append(idx)
        # Year bucket (±1)
        year = rec.get("year")
        if year and isinstance(year, int):
            for y in [year - 1, year, year + 1]:
                key = f"{prefix}_{y}"
                blocks[key].append(idx)
    return dict(blocks)


def candidate_pairs(records: list[dict]) -> tuple[set[tuple[int, int]], int, int]:
    """
    Generate candidate pairs via blocking.
    Returns (pairs_set, num_candidates, n_squared).
    """
    blocks = build_blocks(records)
    pairs: set[tuple[int, int]] = set()
    for indices in blocks.values():
        if len(indices) < 2:
            continue
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                a, b = sorted((indices[i], indices[j]))
                pairs.add((a, b))
    n = len(records)
    n_sq = n * (n - 1) // 2
    return pairs, len(pairs), n_sq


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

WEIGHTS = {
    "token_set_ratio": 0.35,
    "wratio": 0.25,
    "year_proximity": 0.15,
    "language_match": 0.10,
    "runtime_closeness": 0.10,
    "cast_overlap": 0.05,
}

AUTO_FLAG_THRESHOLD = 0.83
NEEDS_REVIEW_THRESHOLD = 0.60


def _year_proximity_score(y1: Any, y2: Any) -> float:
    try:
        diff = abs(int(y1) - int(y2))
        return max(0.0, 1.0 - diff / 5.0)
    except (TypeError, ValueError):
        return 0.5  # unknown


def _runtime_closeness(r1: Any, r2: Any) -> float:
    try:
        diff = abs(float(r1) - float(r2))
        return max(0.0, 1.0 - diff / 60.0)
    except (TypeError, ValueError):
        return 0.5


def _cast_overlap(c1: list, c2: list) -> float:
    if not c1 or not c2:
        return 0.5
    s1 = {n.lower() for n in c1}
    s2 = {n.lower() for n in c2}
    union = s1 | s2
    if not union:
        return 0.5
    return len(s1 & s2) / len(union)


def score_pair(rec_a: dict, rec_b: dict) -> dict:
    """Return per-signal scores and weighted composite score."""
    nt_a = normalise_title(rec_a.get("title", ""))
    nt_b = normalise_title(rec_b.get("title", ""))

    signals: dict[str, float] = {}

    # Fuzzy title signals
    signals["token_set_ratio"] = fuzz.token_set_ratio(nt_a, nt_b) / 100.0
    signals["wratio"] = fuzz.WRatio(nt_a, nt_b) / 100.0

    # Metadata signals
    signals["year_proximity"] = _year_proximity_score(
        rec_a.get("year"), rec_b.get("year")
    )
    signals["language_match"] = (
        1.0 if rec_a.get("language") == rec_b.get("language") else 0.0
    )
    signals["runtime_closeness"] = _runtime_closeness(
        rec_a.get("runtime"), rec_b.get("runtime")
    )
    signals["cast_overlap"] = _cast_overlap(
        rec_a.get("cast", []), rec_b.get("cast", [])
    )

    composite = sum(WEIGHTS[k] * v for k, v in signals.items())

    if composite >= AUTO_FLAG_THRESHOLD:
        verdict = "AUTO_FLAG"
    elif composite >= NEEDS_REVIEW_THRESHOLD:
        verdict = "NEEDS_REVIEW"
    else:
        verdict = "DISTINCT"

    return {
        "id_a": rec_a["catalog_id"],
        "id_b": rec_b["catalog_id"],
        "composite_score": round(composite, 4),
        "verdict": verdict,
        "signals": {k: round(v, 4) for k, v in signals.items()},
        "title_a": rec_a.get("title", ""),
        "title_b": rec_b.get("title", ""),
        "year_a": rec_a.get("year"),
        "year_b": rec_b.get("year"),
    }


# ---------------------------------------------------------------------------
# Full detection run
# ---------------------------------------------------------------------------

def run_detection(records: list[dict]) -> dict:
    """
    Run end-to-end detection.
    Returns {pairs, stats}.
    """
    pairs_set, n_candidates, n_sq = candidate_pairs(records)
    savings_pct = round((1 - n_candidates / max(n_sq, 1)) * 100, 1)
    print(
        f"  Blocking: {n_candidates:,} candidate pairs "
        f"(vs {n_sq:,} n²; saved {savings_pct}%)"
    )

    idx_map = {rec["catalog_id"]: rec for rec in records}

    pair_scores: list[dict] = []
    auto_flag: list[dict] = []
    needs_review: list[dict] = []

    for i, j in pairs_set:
        a = records[i]
        b = records[j]
        result = score_pair(a, b)
        pair_scores.append(result)
        if result["verdict"] == "AUTO_FLAG":
            auto_flag.append(result)
        elif result["verdict"] == "NEEDS_REVIEW":
            needs_review.append(result)

    # Sort by score descending
    pair_scores.sort(key=lambda x: -x["composite_score"])

    stats = {
        "total_records": len(records),
        "candidate_pairs": n_candidates,
        "n_squared": n_sq,
        "comparison_savings_pct": savings_pct,
        "auto_flagged": len(auto_flag),
        "needs_review": len(needs_review),
        "distinct": len(pair_scores) - len(auto_flag) - len(needs_review),
    }

    return {"pair_scores": pair_scores, "stats": stats}


# ---------------------------------------------------------------------------
# Evaluation against ground truth labels
# ---------------------------------------------------------------------------

def evaluate(pair_scores: list[dict], labels: dict) -> dict:
    """Compute precision, recall, F1 against seeded_labels.json."""
    # Build set of true duplicate pairs (unordered)
    true_pairs: set[frozenset] = set()
    for entry in labels.get("duplicates", []):
        true_pairs.add(frozenset([entry["dup_id"], entry["original_id"]]))

    predicted_pairs: set[frozenset] = set()
    for ps in pair_scores:
        if ps["verdict"] in ("AUTO_FLAG", "NEEDS_REVIEW"):
            predicted_pairs.add(frozenset([ps["id_a"], ps["id_b"]]))

    tp = len(true_pairs & predicted_pairs)
    fp = len(predicted_pairs - true_pairs)
    fn = len(true_pairs - predicted_pairs)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "true_duplicates": len(true_pairs),
        "detected": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


if __name__ == "__main__":
    catalog = json.loads(CATALOG_FILE.read_text())
    result = run_detection(catalog)
    print(json.dumps(result["stats"], indent=2))
