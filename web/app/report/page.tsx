"use client";

import { useEffect, useState, useRef } from "react";
import { FileSpreadsheet, Timer, Download } from "lucide-react";
import { fetchSummary, fetchIssues, fetchBenchmark } from "@/lib/data";
import type { Summary, Issue, Benchmark, ReviewActivity } from "@/lib/types";
import * as XLSX from "xlsx";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ReportPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genTime, setGenTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSummary(), fetchIssues(), fetchBenchmark()]).then(([s, iss, b]) => {
      setSummary(s);
      setIssues(iss);
      setBenchmark(b);
      setLoading(false);
    });
  }, []);

  const generateReport = () => {
    if (!summary || !benchmark) return;
    setGenerating(true);
    const t0 = performance.now();

    try {
      const wb = XLSX.utils.book_new();

      // ---- Sheet 1: Summary ----
      const summaryRows = [
        ["Catalog Quality Checker — Daily Report"],
        ["Generated at", new Date().toISOString()],
        [],
        ["OVERVIEW"],
        ["Total Records", summary.total_records],
        ["Total Issues", summary.total_issues],
        [],
        ["ISSUES BY CATEGORY"],
        ...Object.entries(summary.issues_by_category).map(([k, v]) => [k, v]),
        [],
        ["ISSUES BY SEVERITY"],
        ...Object.entries(summary.issues_by_severity).map(([k, v]) => [k, v]),
        [],
        ["DETECTION PERFORMANCE"],
        ["Seeded Duplicates (true)", summary.evaluation.true_duplicates],
        ["Detected", summary.evaluation.detected],
        ["Precision", `${(summary.evaluation.precision * 100).toFixed(1)}%`],
        ["Recall", `${(summary.evaluation.recall * 100).toFixed(1)}%`],
        ["F1 Score", `${(summary.evaluation.f1 * 100).toFixed(1)}%`],
        [],
        ["BENCHMARK (real measured values)"],
        ["Pipeline runtime (s)", benchmark.detection_seconds_real],
        ["Per-record time (s)", benchmark.detection_seconds_per_record_real],
        ["NOTE (ESTIMATES)", benchmark._note],
        ["Manual time estimate (s)", benchmark.manual_detection_total_seconds_estimate],
        ["Time saved estimate (s)", benchmark.time_saved_seconds_estimate],
        ["Speedup factor estimate", benchmark.speedup_factor_estimate],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
      ws1["!cols"] = [{ wch: 40 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Summary");

      // ---- Sheet 2: Issues ----
      const issueHeader = ["ID", "Category", "Severity", "Record IDs", "Evidence Summary", "Suggested Action"];
      const issueRows = issues.map((iss) => [
        iss.id,
        iss.category,
        iss.severity,
        iss.record_ids.join(", "),
        JSON.stringify(iss.evidence).slice(0, 200),
        iss.suggested_action,
      ]);
      const ws2 = XLSX.utils.aoa_to_sheet([issueHeader, ...issueRows]);
      ws2["!cols"] = [{ wch: 15 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 60 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Issues");

      // ---- Sheet 3: Activity Log ----
      let activityLog: ReviewActivity[] = [];
      try {
        activityLog = JSON.parse(localStorage.getItem("cqc_activity_log") || "[]");
      } catch {}
      const logHeader = ["Issue ID", "Decision", "Timestamp"];
      const logRows = activityLog.map((a) => [a.issue_id, a.decision, formatDate(a.timestamp)]);

      // Accuracy: reviewed / total
      const reviewed = activityLog.length;
      const totalIssues = issues.length;
      const accepted = activityLog.filter((a) => a.decision === "ACCEPTED").length;
      const rejected = activityLog.filter((a) => a.decision === "REJECTED").length;
      const escalated = activityLog.filter((a) => a.decision === "ESCALATED").length;

      const ws3 = XLSX.utils.aoa_to_sheet([
        logHeader,
        ...logRows,
        [],
        ["ACTIVITY SUMMARY"],
        ["Records reviewed", reviewed],
        ["Total issues", totalIssues],
        ["Accepted", accepted],
        ["Rejected", rejected],
        ["Escalated", escalated],
        ["Reviewer accuracy %", totalIssues > 0 ? `${((reviewed / totalIssues) * 100).toFixed(1)}%` : "N/A"],
      ]);
      ws3["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws3, "Activity Log");

      XLSX.writeFile(wb, `catalog_qc_report_${new Date().toISOString().slice(0, 10)}.xlsx`);

      const t1 = performance.now();
      setGenTime(Math.round(t1 - t0));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#76C457] border-t-transparent animate-spin" />
          <p className="text-[#7d8590] text-sm">Loading report data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Daily Report</h1>
          <p className="text-[#7d8590] text-sm mt-1">
            Export a full QA report to .xlsx with Summary, Issues, and Activity Log sheets
          </p>
        </div>
        <button
          id="generate-report-btn"
          className="btn btn-primary"
          onClick={generateReport}
          disabled={generating || !summary}
        >
          {generating ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Export .xlsx
            </>
          )}
        </button>
      </div>

      {genTime !== null && (
        <div className="glass-card p-4 flex items-center gap-3 border-l-2 border-[#76C457]">
          <Timer className="w-4 h-4 text-[#76C457]" />
          <span className="text-sm text-[#e6edf3]">
            Report generated in <strong>{genTime}ms</strong>
          </span>
        </div>
      )}

      {/* Report preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sheet 1: Summary preview */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="w-4 h-4 text-[#76C457]" />
            <h2 className="text-sm font-semibold text-[#e6edf3]">Sheet 1: Summary</h2>
          </div>
          {summary && (
            <div className="space-y-3 text-xs">
              <div className="text-[#7d8590]">Total Records</div>
              <div className="text-lg font-bold text-[#e6edf3]">{summary.total_records.toLocaleString()}</div>
              <div className="text-[#7d8590] mt-2">Issues by Category</div>
              {Object.entries(summary.issues_by_category).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-[#7d8590]">{k.replace(/_/g, " ")}</span>
                  <span className="text-[#e6edf3] font-mono">{v}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-[#21262d]">
                <div className="flex justify-between"><span className="text-[#7d8590]">Precision</span><span className="text-[#76C457] font-mono">{(summary.evaluation.precision * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-[#7d8590]">Recall</span><span className="text-[#76C457] font-mono">{(summary.evaluation.recall * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-[#7d8590]">F1</span><span className="text-[#76C457] font-mono">{(summary.evaluation.f1 * 100).toFixed(1)}%</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Sheet 2: Issues preview */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="w-4 h-4 text-[#ffa600]" />
            <h2 className="text-sm font-semibold text-[#e6edf3]">Sheet 2: Issues</h2>
          </div>
          <div className="space-y-2">
            {issues.slice(0, 8).map((iss) => (
              <div key={iss.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-[#7d8590] w-20 flex-shrink-0">{iss.id}</span>
                <span className={`badge ${iss.severity === "CRITICAL" ? "badge-critical" : iss.severity === "HIGH" ? "badge-high" : "badge-medium"}`}>
                  {iss.severity[0]}
                </span>
                <span className="text-[#e6edf3] truncate">{iss.category.replace(/_/g, " ")}</span>
              </div>
            ))}
            {issues.length > 8 && (
              <div className="text-xs text-[#7d8590]">… and {issues.length - 8} more</div>
            )}
          </div>
        </div>

        {/* Sheet 3: Activity Log preview */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="w-4 h-4 text-[#569cd6]" />
            <h2 className="text-sm font-semibold text-[#e6edf3]">Sheet 3: Activity Log</h2>
          </div>
          <ActivityLogPreview />
        </div>
      </div>

      {/* Benchmark note */}
      {benchmark && (
        <div className="glass-card p-4 border-l-2 border-[#ffa600]">
          <p className="text-xs text-[#7d8590]">
            <span className="text-[#ffa600] font-semibold">Benchmark note: </span>
            {benchmark._note}
          </p>
        </div>
      )}
    </div>
  );
}

function ActivityLogPreview() {
  const [log, setLog] = useState<ReviewActivity[]>([]);

  useEffect(() => {
    try {
      setLog(JSON.parse(localStorage.getItem("cqc_activity_log") || "[]"));
    } catch {}
  }, []);

  const accepted = log.filter((a) => a.decision === "ACCEPTED").length;
  const rejected = log.filter((a) => a.decision === "REJECTED").length;
  const escalated = log.filter((a) => a.decision === "ESCALATED").length;

  if (log.length === 0) {
    return (
      <div className="text-xs text-[#7d8590] text-center py-4">
        No review activity yet.<br />Go to Review Queue to start reviewing.
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between"><span className="text-[#7d8590]">Reviews logged</span><span className="text-[#e6edf3] font-bold">{log.length}</span></div>
      <div className="flex justify-between"><span className="text-[#7d8590]">Accepted</span><span className="text-[#76C457]">{accepted}</span></div>
      <div className="flex justify-between"><span className="text-[#7d8590]">Rejected</span><span className="text-[#f85149]">{rejected}</span></div>
      <div className="flex justify-between"><span className="text-[#7d8590]">Escalated</span><span className="text-[#ffa600]">{escalated}</span></div>
      <div className="pt-2 border-t border-[#21262d] text-[#7d8590]">Recent:</div>
      {log.slice(-3).map((a, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="font-mono text-[#7d8590]">{a.issue_id}</span>
          <span className={`badge ${a.decision === "ACCEPTED" ? "badge-medium" : a.decision === "REJECTED" ? "badge-critical" : "badge-high"}`}>
            {a.decision[0]}
          </span>
        </div>
      ))}
    </div>
  );
}
