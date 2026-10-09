"""
run_pipeline.py
===============
One-command entry point. Run:
    python engine/run_pipeline.py

Executes: build_dataset → detect → classify → benchmark → export
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "engine"))

DATA_DIR = ROOT / "data"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    t_start = time.perf_counter()
    print("=" * 60)
    print("  Catalog Quality Checker — End-to-End Pipeline")
    print("=" * 60)

    # ---- Phase 1: Build / load dataset ----
    print("\n[Phase 1] Building dataset…")
    from build_dataset import main as build_main
    build_main()

    catalog_file = DATA_DIR / "catalog.json"
    labels_file = DATA_DIR / "seeded_labels.json"
    gt_file = DATA_DIR / "ground_truth.json"

    catalog = json.loads(catalog_file.read_text(encoding='utf-8'))
    labels = json.loads(labels_file.read_text(encoding='utf-8'))
    ground_truth = json.loads(gt_file.read_text(encoding='utf-8'))
    gt_map = {r["tmdb_id"]: r for r in ground_truth}

    print(f"  Catalog: {len(catalog)} records")
    print(f"  Labels: {len(labels['duplicates'])} seeded duplicates, "
          f"{len(labels['defects'])} defects")

    # ---- Phase 2: Detection ----
    print("\n[Phase 2] Running detection engine…")
    from detector import run_detection, evaluate
    from benchmark import run_benchmark

    def _run(cat):
        return run_detection(cat)

    benchmark_data, detection_result = run_benchmark(catalog, _run)
    pair_scores = detection_result["pair_scores"]
    detection_stats = detection_result["stats"]

    print(f"  Detection stats: {json.dumps(detection_stats, indent=4)}")

    # Evaluate (detector does NOT read labels.json — we pass it here only for eval)
    eval_metrics = evaluate(pair_scores, labels)
    print(f"\n  Evaluation:")
    print(f"    Seeded duplicates detected: {eval_metrics['detected']} / {eval_metrics['true_duplicates']}")
    print(f"    Precision: {eval_metrics['precision']:.3f}")
    print(f"    Recall:    {eval_metrics['recall']:.3f}")
    print(f"    F1:        {eval_metrics['f1']:.3f}")

    # ---- Phase 3: Classify ----
    print("\n[Phase 3] Classifying issues…")
    from classifier import classify_issues

    flagged_pairs = [p for p in pair_scores if p["verdict"] in ("AUTO_FLAG", "NEEDS_REVIEW")]
    issues = classify_issues(catalog, flagged_pairs, gt_map)

    by_cat: dict[str, int] = {}
    for iss in issues:
        by_cat[iss["category"]] = by_cat.get(iss["category"], 0) + 1
    print(f"  Total issues: {len(issues)}")
    for cat, cnt in sorted(by_cat.items()):
        print(f"    {cat}: {cnt}")

    # ---- Phase 4: Export ----
    print("\n[Phase 4] Exporting artifacts…")
    from exporter import export_all

    # Add eval to benchmark
    benchmark_data["evaluation"] = eval_metrics

    export_all(
        issues=issues,
        pair_scores=pair_scores,
        detection_stats=detection_stats,
        eval_metrics=eval_metrics,
        benchmark=benchmark_data,
        catalog=catalog,
    )

    t_end = time.perf_counter()
    print(f"\n✓ Pipeline complete in {t_end - t_start:.1f}s")
    print(f"  Artifacts written to: {WEB_DATA_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
