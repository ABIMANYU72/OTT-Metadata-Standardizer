"""
benchmark.py
============
Measures real runtime of the full detection pipeline and daily-report generation.

Manual baseline figures are ESTIMATES based on configurable constants.
NEVER hardcoded to hit a target — reports whatever is actually measured.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"

# ---------------------------------------------------------------------------
# Manual baseline ESTIMATES (clearly labelled)
# ---------------------------------------------------------------------------
# These are documented assumptions, NOT measured values.
MANUAL_SECONDS_PER_RECORD: float = 10.0  # ESTIMATE: analyst seconds per record
MANUAL_REPORT_TIME_SECONDS: float = 1800.0  # ESTIMATE: analyst time for daily report (30 min)


def run_benchmark(catalog: list[dict], run_fn, generate_report_fn=None) -> dict:
    """
    Measure actual runtime of run_fn (detection pipeline) and optionally
    generate_report_fn (report generation).

    Returns a benchmark dict with real measurements and manual estimates.
    All estimate fields are clearly labelled.
    """
    n_records = len(catalog)

    # --- Detection pipeline ---
    t0 = time.perf_counter()
    run_result = run_fn(catalog)
    t1 = time.perf_counter()
    detection_seconds = t1 - t0

    # --- Report generation ---
    report_seconds = None
    if generate_report_fn:
        t2 = time.perf_counter()
        generate_report_fn()
        t3 = time.perf_counter()
        report_seconds = t3 - t2

    # --- Manual baseline (ESTIMATES) ---
    manual_detection_seconds_estimate = n_records * MANUAL_SECONDS_PER_RECORD
    manual_report_seconds_estimate = MANUAL_REPORT_TIME_SECONDS

    time_saved_estimate = (
        manual_detection_seconds_estimate - detection_seconds
    )
    speedup_estimate = (
        manual_detection_seconds_estimate / detection_seconds
        if detection_seconds > 0
        else 0.0
    )

    benchmark = {
        "_note": (
            "Fields marked _estimate are ESTIMATES based on documented constants, "
            "not measured values. Detection and report times are real measurements."
        ),
        "n_records": n_records,
        "detection_seconds_real": round(detection_seconds, 3),
        "detection_seconds_per_record_real": round(detection_seconds / max(n_records, 1), 5),
        "report_seconds_real": round(report_seconds, 3) if report_seconds is not None else None,
        "manual_seconds_per_record_estimate": MANUAL_SECONDS_PER_RECORD,
        "manual_detection_total_seconds_estimate": round(manual_detection_seconds_estimate, 1),
        "manual_report_seconds_estimate": MANUAL_REPORT_TIME_SECONDS,
        "time_saved_seconds_estimate": round(time_saved_estimate, 1),
        "speedup_factor_estimate": round(speedup_estimate, 1),
    }

    return benchmark, run_result


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(ROOT / "engine"))
    from detector import run_detection

    catalog_file = DATA_DIR / "catalog.json"
    if not catalog_file.exists():
        print("Run build_dataset.py first.")
        sys.exit(1)

    catalog = json.loads(catalog_file.read_text())
    bm, result = run_benchmark(catalog, run_detection)
    print(json.dumps(bm, indent=2))
