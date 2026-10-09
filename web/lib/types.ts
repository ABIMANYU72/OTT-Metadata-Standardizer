// lib/types.ts — Shared TypeScript types for the dashboard

export interface Issue {
  id: string;
  record_ids: string[];
  category: "DUPLICATE" | "MISSING_METADATA" | "METADATA_MISMATCH" | "INVALID_FORMAT";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  evidence: Record<string, unknown>;
  suggested_action: string;
}

export interface PairScore {
  id_a: string;
  id_b: string;
  composite_score: number;
  verdict: "AUTO_FLAG" | "NEEDS_REVIEW" | "DISTINCT";
  signals: {
    token_set_ratio: number;
    wratio: number;
    year_proximity: number;
    language_match: number;
    runtime_closeness: number;
    cast_overlap: number;
  };
  title_a: string;
  title_b: string;
  year_a: number | null;
  year_b: number | null;
}

export interface Summary {
  total_records: number;
  total_issues: number;
  issues_by_category: Record<string, number>;
  issues_by_severity: Record<string, number>;
  detection: {
    candidate_pairs: number;
    n_squared: number;
    comparison_savings_pct: number;
    auto_flagged: number;
    needs_review: number;
  };
  evaluation: {
    true_duplicates: number;
    detected: number;
    false_positives: number;
    false_negatives: number;
    precision: number;
    recall: number;
    f1: number;
  };
}

export interface Benchmark {
  _note: string;
  n_records: number;
  detection_seconds_real: number;
  detection_seconds_per_record_real: number;
  report_seconds_real: number | null;
  manual_seconds_per_record_estimate: number;
  manual_detection_total_seconds_estimate: number;
  manual_report_seconds_estimate: number;
  time_saved_seconds_estimate: number;
  speedup_factor_estimate: number;
  evaluation?: Summary["evaluation"];
}

export interface CatalogRecord {
  catalog_id: string;
  title: string;
  original_title: string;
  year: number | string | null;
  genres: string[];
  language: string;
  runtime: number | string | null;
  cast: string[];
  synopsis: string;
  certification: string;
  media_type: string;
}

export type ReviewDecision = "ACCEPTED" | "REJECTED" | "ESCALATED" | "PENDING";

export interface ReviewActivity {
  issue_id: string;
  decision: ReviewDecision;
  timestamp: string;
}
