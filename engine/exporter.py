"""
exporter.py
===========
Export JSON artifacts from the detection engine to web/public/data/.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent.parent
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _write(filename: str, data: Any) -> None:
    dest = WEB_DATA_DIR / filename
    dest.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"  Exported → {dest}")


def export_all(
    issues: list[dict],
    pair_scores: list[dict],
    detection_stats: dict,
    eval_metrics: dict,
    benchmark: dict,
    catalog: list[dict],
) -> None:
    """Write all JSON artifacts consumed by the Next.js dashboard."""

    # 1. issues.json
    _write("issues.json", issues)

    # 2. pair_scores.json (top 500 to keep file size manageable)
    _write("pair_scores.json", pair_scores[:500])

    # 3. summary.json — everything the overview KPI cards need
    by_cat: dict[str, int] = {}
    by_sev: dict[str, int] = {}
    for iss in issues:
        by_cat[iss["category"]] = by_cat.get(iss["category"], 0) + 1
        by_sev[iss["severity"]] = by_sev.get(iss["severity"], 0) + 1

    summary = {
        "total_records": detection_stats.get("total_records", 0),
        "total_issues": len(issues),
        "issues_by_category": by_cat,
        "issues_by_severity": by_sev,
        "detection": {
            "candidate_pairs": detection_stats.get("candidate_pairs", 0),
            "n_squared": detection_stats.get("n_squared", 0),
            "comparison_savings_pct": detection_stats.get("comparison_savings_pct", 0),
            "auto_flagged": detection_stats.get("auto_flagged", 0),
            "needs_review": detection_stats.get("needs_review", 0),
        },
        "evaluation": eval_metrics,
    }
    _write("summary.json", summary)

    # 4. benchmark.json
    _write("benchmark.json", benchmark)

    # 5. catalog_sample.json — first 200 records for the review queue
    lite_catalog = []
    for rec in catalog[:500]:
        lite_catalog.append({
            "catalog_id": rec.get("catalog_id"),
            "title": rec.get("title", ""),
            "original_title": rec.get("original_title", ""),
            "year": rec.get("year"),
            "genres": rec.get("genres", []),
            "language": rec.get("language", ""),
            "runtime": rec.get("runtime"),
            "cast": rec.get("cast", []),
            "synopsis": (rec.get("synopsis") or "")[:300],
            "certification": rec.get("certification", ""),
            "media_type": rec.get("media_type", "movie"),
        })
    _write("catalog_sample.json", lite_catalog)
