"""
classifier.py
=============
Classify every issue into exactly 4 SOP categories:
  DUPLICATE, MISSING_METADATA, METADATA_MISMATCH, INVALID_FORMAT

Each issue has: id, record_ids, category, severity, evidence, suggested_action.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"

# ---------------------------------------------------------------------------
# SOP definitions
# ---------------------------------------------------------------------------

CATEGORIES = ("DUPLICATE", "MISSING_METADATA", "METADATA_MISMATCH", "INVALID_FORMAT")

SEVERITY_LEVELS = ("CRITICAL", "HIGH", "MEDIUM", "LOW")

SEVERITY_MAP = {
    "DUPLICATE": "HIGH",
    "MISSING_METADATA": "MEDIUM",
    "METADATA_MISMATCH": "HIGH",
    "INVALID_FORMAT": "MEDIUM",
}

SUGGESTED_ACTIONS = {
    "DUPLICATE": "Review pair, merge or remove the duplicate, preserve richer metadata.",
    "MISSING_METADATA": "Enrich record from TMDB or primary data source. Escalate if title is missing.",
    "METADATA_MISMATCH": "Cross-check against TMDB ground truth and update the field value.",
    "INVALID_FORMAT": "Correct field to comply with schema: year YYYY (int), runtime positive int, language ISO 639-1.",
}

# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

VALID_YEAR_RE = re.compile(r"^\d{4}$")
VALID_LANGUAGE_RE = re.compile(r"^[a-z]{2}(-[A-Z]{2})?$")


def _is_valid_year(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, int):
        return 1900 <= value <= 2100
    s = str(value).strip()
    return bool(VALID_YEAR_RE.match(s)) and (1900 <= int(s) <= 2100)


def _is_valid_runtime(value: Any) -> bool:
    if value is None:
        return True  # missing handled separately
    try:
        r = float(value)
        return 1 <= r <= 600
    except (TypeError, ValueError):
        return False


def _is_valid_language(value: Any) -> bool:
    if not value:
        return False
    return bool(VALID_LANGUAGE_RE.match(str(value).strip()))


# ---------------------------------------------------------------------------
# Issue generation
# ---------------------------------------------------------------------------

def _make_issue(
    issue_id: str,
    record_ids: list[str],
    category: str,
    severity: str,
    evidence: dict,
    suggested_action: str,
) -> dict:
    return {
        "id": issue_id,
        "record_ids": record_ids,
        "category": category,
        "severity": severity,
        "evidence": evidence,
        "suggested_action": suggested_action,
    }


def classify_issues(
    catalog: list[dict],
    pair_scores: list[dict],
    ground_truth_map: dict[int, dict] | None = None,
) -> list[dict]:
    """
    Generate issues from:
    1. Duplicate pairs flagged by detector
    2. Missing metadata in individual records
    3. Metadata mismatches vs TMDB ground truth (if available)
    4. Invalid format fields
    """
    issues: list[dict] = []
    counter = {"total": 0}

    def next_id(category: str) -> str:
        counter["total"] += 1
        prefix = category[0]  # D, M, X, F
        return f"ISS-{prefix}{counter['total']:04d}"

    # ---- 1. DUPLICATES from pair scores ----
    for ps in pair_scores:
        if ps["verdict"] in ("AUTO_FLAG", "NEEDS_REVIEW"):
            issue_id = next_id("DUPLICATE")
            sev = "CRITICAL" if ps["verdict"] == "AUTO_FLAG" else "HIGH"
            issues.append(_make_issue(
                issue_id=issue_id,
                record_ids=[ps["id_a"], ps["id_b"]],
                category="DUPLICATE",
                severity=sev,
                evidence={
                    "composite_score": ps["composite_score"],
                    "verdict": ps["verdict"],
                    "title_a": ps["title_a"],
                    "title_b": ps["title_b"],
                    "year_a": ps["year_a"],
                    "year_b": ps["year_b"],
                    "signals": ps["signals"],
                },
                suggested_action=SUGGESTED_ACTIONS["DUPLICATE"],
            ))

    # ---- 2. MISSING_METADATA ----
    required_fields = [
        ("title", "CRITICAL"),
        ("year", "HIGH"),
        ("genres", "MEDIUM"),
        ("synopsis", "LOW"),
        ("language", "MEDIUM"),
        ("cast", "LOW"),
        ("certification", "LOW"),
    ]

    for rec in catalog:
        cid = rec.get("catalog_id", "UNKNOWN")
        for field, sev in required_fields:
            val = rec.get(field)
            is_missing = (
                val is None
                or val == ""
                or val == []
                or (isinstance(val, list) and len(val) == 0)
            )
            if is_missing:
                issue_id = next_id("MISSING_METADATA")
                issues.append(_make_issue(
                    issue_id=issue_id,
                    record_ids=[cid],
                    category="MISSING_METADATA",
                    severity=sev,
                    evidence={
                        "field": field,
                        "value": val,
                        "title": rec.get("title", ""),
                    },
                    suggested_action=SUGGESTED_ACTIONS["MISSING_METADATA"],
                ))

    # ---- 3. METADATA_MISMATCH (vs TMDB ground truth) ----
    if ground_truth_map:
        for rec in catalog:
            tmdb_id = rec.get("tmdb_id")
            if not tmdb_id or tmdb_id < 0:
                continue
            gt = ground_truth_map.get(tmdb_id)
            if not gt:
                continue

            mismatches = []
            # Year mismatch (more than 1 year off)
            if (rec.get("year") and gt.get("year")
                    and isinstance(rec["year"], int) and isinstance(gt["year"], int)
                    and abs(rec["year"] - gt["year"]) > 1):
                mismatches.append({
                    "field": "year",
                    "catalog_value": rec["year"],
                    "tmdb_value": gt["year"],
                })
            # Language mismatch
            if (rec.get("language") and gt.get("language")
                    and rec["language"] != gt["language"]):
                mismatches.append({
                    "field": "language",
                    "catalog_value": rec["language"],
                    "tmdb_value": gt["language"],
                })

            if mismatches:
                issue_id = next_id("METADATA_MISMATCH")
                issues.append(_make_issue(
                    issue_id=issue_id,
                    record_ids=[rec.get("catalog_id", "UNKNOWN")],
                    category="METADATA_MISMATCH",
                    severity="HIGH",
                    evidence={
                        "tmdb_id": tmdb_id,
                        "title": rec.get("title", ""),
                        "mismatches": mismatches,
                    },
                    suggested_action=SUGGESTED_ACTIONS["METADATA_MISMATCH"],
                ))

    # ---- 4. INVALID_FORMAT ----
    for rec in catalog:
        cid = rec.get("catalog_id", "UNKNOWN")
        title = rec.get("title", "")

        # Invalid year
        year = rec.get("year")
        if year is not None and not _is_valid_year(year):
            issue_id = next_id("INVALID_FORMAT")
            issues.append(_make_issue(
                issue_id=issue_id,
                record_ids=[cid],
                category="INVALID_FORMAT",
                severity="HIGH",
                evidence={
                    "field": "year",
                    "value": year,
                    "title": title,
                    "expected": "integer 1900–2100",
                },
                suggested_action=SUGGESTED_ACTIONS["INVALID_FORMAT"],
            ))

        # Invalid runtime
        runtime = rec.get("runtime")
        if runtime is not None and not _is_valid_runtime(runtime):
            issue_id = next_id("INVALID_FORMAT")
            issues.append(_make_issue(
                issue_id=issue_id,
                record_ids=[cid],
                category="INVALID_FORMAT",
                severity="MEDIUM",
                evidence={
                    "field": "runtime",
                    "value": runtime,
                    "title": title,
                    "expected": "positive integer 1–600",
                },
                suggested_action=SUGGESTED_ACTIONS["INVALID_FORMAT"],
            ))

        # Invalid language
        lang = rec.get("language")
        if lang is not None and not _is_valid_language(lang):
            issue_id = next_id("INVALID_FORMAT")
            issues.append(_make_issue(
                issue_id=issue_id,
                record_ids=[cid],
                category="INVALID_FORMAT",
                severity="LOW",
                evidence={
                    "field": "language",
                    "value": lang,
                    "title": title,
                    "expected": "ISO 639-1 (2-letter code)",
                },
                suggested_action=SUGGESTED_ACTIONS["INVALID_FORMAT"],
            ))

    return issues


if __name__ == "__main__":
    import sys
    catalog = json.loads((DATA_DIR.parent / "data" / "catalog.json").read_text())
    print(f"Loaded {len(catalog)} catalog records")
    issues = classify_issues(catalog, [])
    by_cat = {}
    for iss in issues:
        by_cat.setdefault(iss["category"], 0)
        by_cat[iss["category"]] += 1
    print("Issues by category:", json.dumps(by_cat, indent=2))
