"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { fetchIssues, fetchCatalogSample } from "@/lib/data";
import type { Issue, CatalogRecord, ReviewDecision, ReviewActivity } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  DUPLICATE: "badge-duplicate",
  MISSING_METADATA: "badge-missing",
  METADATA_MISMATCH: "badge-mismatch",
  INVALID_FORMAT: "badge-format",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "badge-critical",
  HIGH: "badge-high",
  MEDIUM: "badge-medium",
  LOW: "badge-low",
};

const STORAGE_KEY = "cqc_review_decisions";

function loadDecisions(): Record<string, ReviewDecision> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveDecision(issueId: string, decision: ReviewDecision) {
  const decisions = loadDecisions();
  decisions[issueId] = decision;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
  // Also save activity log
  const logKey = "cqc_activity_log";
  const log: ReviewActivity[] = JSON.parse(localStorage.getItem(logKey) || "[]");
  log.push({ issue_id: issueId, decision, timestamp: new Date().toISOString() });
  localStorage.setItem(logKey, JSON.stringify(log));
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#7d8590]">{label.replace(/_/g, " ")}</span>
        <span className="text-[#e6edf3] font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 bg-[#21262d] rounded-full overflow-hidden">
        <div
          className="h-full signal-bar"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RecordCard({ rec, label }: { rec: CatalogRecord | null; label: string }) {
  if (!rec) return (
    <div className="flex-1 glass-card p-4 text-center text-[#7d8590] text-sm">
      Record not found in sample
    </div>
  );
  return (
    <div className="flex-1 glass-card p-4 space-y-2">
      <div className="text-xs text-[#7d8590] font-semibold uppercase tracking-wider mb-2">{label}</div>
      <div className="text-sm font-bold text-[#e6edf3]">{rec.title || <span className="text-[#f85149]">[MISSING]</span>}</div>
      {rec.original_title && rec.original_title !== rec.title && (
        <div className="text-xs text-[#7d8590]">aka {rec.original_title}</div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
        <div><span className="text-[#7d8590]">Year: </span><span className="text-[#e6edf3]">{rec.year ?? "—"}</span></div>
        <div><span className="text-[#7d8590]">Lang: </span><span className="text-[#e6edf3]">{rec.language || "—"}</span></div>
        <div><span className="text-[#7d8590]">Runtime: </span><span className="text-[#e6edf3]">{rec.runtime ? `${rec.runtime}m` : "—"}</span></div>
        <div><span className="text-[#7d8590]">Cert: </span><span className="text-[#e6edf3]">{rec.certification || "—"}</span></div>
        <div className="col-span-2"><span className="text-[#7d8590]">Genres: </span><span className="text-[#e6edf3]">{rec.genres?.join(", ") || "—"}</span></div>
        <div className="col-span-2"><span className="text-[#7d8590]">Cast: </span><span className="text-[#e6edf3]">{rec.cast?.join(", ") || "—"}</span></div>
      </div>
      {rec.synopsis && (
        <p className="text-xs text-[#7d8590] leading-relaxed mt-2 line-clamp-3">{rec.synopsis}</p>
      )}
      <div className="text-[10px] text-[#7d8590] mt-2 font-mono">{rec.catalog_id}</div>
    </div>
  );
}

export default function QueuePage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [catalog, setCatalog] = useState<CatalogRecord[]>([]);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [selected, setSelected] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [filterSev, setFilterSev] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchIssues(), fetchCatalogSample()]).then(([iss, cat]) => {
      setIssues(iss);
      setCatalog(cat);
      setDecisions(loadDecisions());
      setLoading(false);
    });
  }, []);

  const catalogMap = Object.fromEntries(catalog.map((r) => [r.catalog_id, r]));

  const filteredIssues = issues.filter((iss) => {
    const matchSearch =
      !search ||
      iss.id.toLowerCase().includes(search.toLowerCase()) ||
      iss.record_ids.some((id) => id.toLowerCase().includes(search.toLowerCase())) ||
      JSON.stringify(iss.evidence).toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "ALL" || iss.category === filterCat;
    const matchSev = filterSev === "ALL" || iss.severity === filterSev;
    return matchSearch && matchCat && matchSev;
  });

  const current = filteredIssues[selected];

  const decide = useCallback(
    (decision: ReviewDecision) => {
      if (!current) return;
      saveDecision(current.id, decision);
      setDecisions((d) => ({ ...d, [current.id]: decision }));
    },
    [current]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "j" || e.key === "J") setSelected((s) => Math.min(s + 1, filteredIssues.length - 1));
      if (e.key === "k" || e.key === "K") setSelected((s) => Math.max(s - 1, 0));
      if (e.key === "a" || e.key === "A") decide("ACCEPTED");
      if (e.key === "r" || e.key === "R") decide("REJECTED");
      if (e.key === "e" || e.key === "E") decide("ESCALATED");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [decide, filteredIssues.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#76C457] border-t-transparent animate-spin" />
          <p className="text-[#7d8590] text-sm">Loading review queue…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">Review Queue</h1>
          <p className="text-[#7d8590] text-sm mt-1">
            {filteredIssues.length} issues · Shortcuts: J/K navigate · A accept · R reject · E escalate
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-medium">{Object.keys(decisions).length} reviewed</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#7d8590]" />
          <input
            className="input pl-8 w-64"
            placeholder="Search issues…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(0); }}
            id="queue-search"
          />
        </div>
        <select
          className="input"
          value={filterCat}
          onChange={(e) => { setFilterCat(e.target.value); setSelected(0); }}
          id="queue-filter-category"
        >
          <option value="ALL">All Categories</option>
          <option value="DUPLICATE">Duplicate</option>
          <option value="MISSING_METADATA">Missing Metadata</option>
          <option value="METADATA_MISMATCH">Metadata Mismatch</option>
          <option value="INVALID_FORMAT">Invalid Format</option>
        </select>
        <select
          className="input"
          value={filterSev}
          onChange={(e) => { setFilterSev(e.target.value); setSelected(0); }}
          id="queue-filter-severity"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      <div className="flex gap-6" style={{ minHeight: "60vh" }}>
        {/* Left: issue list */}
        <div className="w-80 flex-shrink-0 glass-card overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            {filteredIssues.length === 0 && (
              <div className="p-8 text-center text-[#7d8590] text-sm">No issues match filters</div>
            )}
            {filteredIssues.map((iss, i) => {
              const dec = decisions[iss.id];
              return (
                <div
                  key={iss.id}
                  className={`p-3 border-b border-[#21262d] cursor-pointer transition-all ${
                    i === selected ? "bg-[#2A7C13]/10 border-l-2 border-l-[#76C457]" : "hover:bg-[#161b22]"
                  }`}
                  onClick={() => setSelected(i)}
                  id={`issue-row-${i}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-[#7d8590]">{iss.id}</span>
                    {dec && (
                      <span className={`badge ${dec === "ACCEPTED" ? "badge-medium" : dec === "REJECTED" ? "badge-critical" : "badge-high"}`}>
                        {dec[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={`badge ${CATEGORY_COLORS[iss.category]}`}>
                      {iss.category.replace("_", " ")}
                    </span>
                    <span className={`badge ${SEVERITY_COLORS[iss.severity]}`}>
                      {iss.severity}
                    </span>
                  </div>
                  {!!(iss.evidence as Record<string, unknown>).title && (
                    <div className="text-xs text-[#e6edf3] mt-1 truncate">
                      {String((iss.evidence as Record<string, unknown>).title)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-[#21262d] flex items-center justify-between">
            <button
              className="btn btn-secondary py-1 px-2 text-xs"
              onClick={() => setSelected((s) => Math.max(s - 1, 0))}
              disabled={selected === 0}
              id="queue-prev-btn"
            >
              <ChevronLeft className="w-3 h-3" /> K
            </button>
            <span className="text-xs text-[#7d8590]">{selected + 1} / {filteredIssues.length}</span>
            <button
              className="btn btn-secondary py-1 px-2 text-xs"
              onClick={() => setSelected((s) => Math.min(s + 1, filteredIssues.length - 1))}
              disabled={selected >= filteredIssues.length - 1}
              id="queue-next-btn"
            >
              J <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 space-y-4">
          {!current ? (
            <div className="glass-card p-8 text-center text-[#7d8590]">Select an issue to review</div>
          ) : (
            <>
              {/* Header */}
              <div className="glass-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-[#7d8590]">{current.id}</span>
                      <span className={`badge ${CATEGORY_COLORS[current.category]}`}>
                        {current.category.replace(/_/g, " ")}
                      </span>
                      <span className={`badge ${SEVERITY_COLORS[current.severity]}`}>
                        {current.severity}
                      </span>
                      {decisions[current.id] && (
                        <span className={`badge ${decisions[current.id] === "ACCEPTED" ? "badge-medium" : decisions[current.id] === "REJECTED" ? "badge-critical" : "badge-high"}`}>
                          {decisions[current.id]}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#7d8590]">
                      Records: {current.record_ids.join(", ")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button id="btn-accept" className="btn btn-accept" onClick={() => decide("ACCEPTED")}>
                      ✓ Accept <kbd className="ml-1 text-[10px] opacity-60">A</kbd>
                    </button>
                    <button id="btn-reject" className="btn btn-danger" onClick={() => decide("REJECTED")}>
                      ✗ Reject <kbd className="ml-1 text-[10px] opacity-60">R</kbd>
                    </button>
                    <button id="btn-escalate" className="btn btn-secondary" onClick={() => decide("ESCALATED")}>
                      ↑ Escalate <kbd className="ml-1 text-[10px] opacity-60">E</kbd>
                    </button>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-[#0d1117] rounded-lg text-xs text-[#7d8590]">
                  <span className="text-[#76C457] font-semibold">Suggested action: </span>
                  {current.suggested_action}
                </div>
              </div>

              {/* Side-by-side record compare (for DUPLICATE) */}
              {current.category === "DUPLICATE" && (
                <div className="flex gap-3">
                  <RecordCard rec={catalogMap[current.record_ids[0]] || null} label="Record A" />
                  <RecordCard rec={catalogMap[current.record_ids[1]] || null} label="Record B" />
                </div>
              )}

              {/* Evidence / signals */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">Evidence & Signal Breakdown</h3>

                {/* Composite score for duplicates */}
                {((current.evidence as Record<string, any>).composite_score !== undefined) && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#7d8590]">Composite Score</span>
                      <span className="font-bold text-[#e6edf3]">
                        {String(Math.round(Number((current.evidence as Record<string, any>).composite_score) * 100))}%
                      </span>
                    </div>
                    <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Number((current.evidence as Record<string, any>).composite_score) * 100}%`,
                          background: `linear-gradient(90deg, #2A7C13, #76C457)`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Signals */}
                {!!(current.evidence as Record<string, any>).signals && (
                  <div className="mt-3">
                    <div className="text-xs text-[#7d8590] mb-2 uppercase tracking-wider">Similarity Signals</div>
                    {Object.entries((current.evidence as Record<string, any>).signals as Record<string, number>).map(
                      ([key, val]) => (
                        <SignalBar key={key} label={key} value={val} />
                      )
                    )}
                  </div>
                )}

                {/* Raw evidence */}
                <div className="mt-3">
                  <div className="text-xs text-[#7d8590] mb-2 uppercase tracking-wider">Raw Evidence</div>
                  <pre className="text-xs text-[#7d8590] bg-[#0d1117] p-3 rounded-lg overflow-x-auto font-mono">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(current.evidence).filter(([k]) => k !== "signals")
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
