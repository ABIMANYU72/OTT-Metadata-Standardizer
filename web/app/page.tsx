"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Database, AlertTriangle, CheckCircle2, Zap,
  TrendingUp, Clock, Shield, Target,
} from "lucide-react";
import { fetchSummary, fetchBenchmark, formatSeconds, formatPct } from "@/lib/data";
import type { Summary, Benchmark } from "@/lib/types";

const CATEGORY_COLORS: Record<string, string> = {
  DUPLICATE: "#f85149",
  MISSING_METADATA: "#ffa600",
  METADATA_MISMATCH: "#569cd6",
  INVALID_FORMAT: "#c586c0",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#f85149",
  HIGH: "#ffa600",
  MEDIUM: "#76C457",
  LOW: "#7d8590",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "#76C457",
  note,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  note?: string;
}) {
  return (
    <div className="kpi-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20`, border: `1px solid ${color}30` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {note && (
          <span className="text-[10px] text-[#7d8590] bg-[#21262d] px-2 py-0.5 rounded">
            {note}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-[#e6edf3] mb-0.5">{value}</div>
      <div className="text-xs text-[#7d8590] font-medium">{label}</div>
      {sub && <div className="text-xs text-[#7d8590] mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchSummary(), fetchBenchmark()])
      .then(([s, b]) => {
        setSummary(s);
        setBenchmark(b);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-[#ffa600] mx-auto mb-3" />
          <p className="text-[#e6edf3] font-medium">Data not available</p>
          <p className="text-[#7d8590] text-sm mt-1">Run <code className="text-[#76C457]">python engine/run_pipeline.py</code> first</p>
          <p className="text-[#7d8590] text-xs mt-2 opacity-70">{error}</p>
        </div>
      </div>
    );
  }

  if (!summary || !benchmark) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#76C457] border-t-transparent animate-spin" />
          <p className="text-[#7d8590] text-sm">Loading dashboard data…</p>
        </div>
      </div>
    );
  }

  const ev = summary.evaluation;
  const det = summary.detection;

  const categoryChartData = Object.entries(summary.issues_by_category).map(
    ([name, value]) => ({ name: name.replace("_", " "), value, fill: CATEGORY_COLORS[name] || "#76C457" })
  );

  const severityChartData = Object.entries(summary.issues_by_severity).map(
    ([name, value]) => ({ name, value, fill: SEVERITY_COLORS[name] || "#7d8590" })
  );

  const timeSavedH = (benchmark.time_saved_seconds_estimate / 3600).toFixed(1);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Catalog Quality Overview</h1>
        <p className="text-[#7d8590] text-sm mt-1">
          End-to-end QA pipeline results — all values from generated JSON
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Database}
          label="Total Records"
          value={summary.total_records.toLocaleString()}
          sub="in catalog"
          color="#76C457"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Issues Found"
          value={summary.total_issues.toLocaleString()}
          sub={`${summary.detection.auto_flagged} auto-flagged`}
          color="#f85149"
        />
        <KpiCard
          icon={Shield}
          label="Duplicates Detected"
          value={`${ev.detected} / ${ev.true_duplicates}`}
          sub={`F1: ${formatPct(ev.f1)}`}
          color="#ffa600"
        />
        <KpiCard
          icon={Zap}
          label="Time Saved"
          value={`~${timeSavedH}h`}
          sub="vs manual review"
          color="#569cd6"
          note="ESTIMATE"
        />
      </div>

      {/* Secondary KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Target}
          label="Precision"
          value={formatPct(ev.precision)}
          sub={`${ev.false_positives} false positives`}
          color="#76C457"
        />
        <KpiCard
          icon={TrendingUp}
          label="Recall"
          value={formatPct(ev.recall)}
          sub={`${ev.false_negatives} missed`}
          color="#76C457"
        />
        <KpiCard
          icon={Clock}
          label="Pipeline Time"
          value={formatSeconds(benchmark.detection_seconds_real)}
          sub={`${benchmark.n_records.toLocaleString()} records`}
          color="#c586c0"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Comparison Savings"
          value={`${det.comparison_savings_pct}%`}
          sub={`${det.candidate_pairs.toLocaleString()} vs ${det.n_squared.toLocaleString()} n²`}
          color="#76C457"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Issues by Category bar chart */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Issues by Category</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryChartData} barCategoryGap="30%">
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#7d8590" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#7d8590" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#161b22",
                  border: "1px solid #21262d",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e6edf3" }}
                itemStyle={{ color: "#7d8590" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {categoryChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Issues by Severity pie chart */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Issues by Severity</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={severityChartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  `${name} ${((percent || 0) * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {severityChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#161b22",
                  border: "1px solid #21262d",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "#7d8590", fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Precision / Recall metrics */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Duplicate Detection Performance</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { label: "Precision", value: ev.precision, color: "#76C457" },
            { label: "Recall", value: ev.recall, color: "#ffa600" },
            { label: "F1 Score", value: ev.f1, color: "#569cd6" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#7d8590]">{label}</span>
                <span className="font-semibold" style={{ color }}>{formatPct(value)}</span>
              </div>
              <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${value * 100}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-[#21262d] grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-[#e6edf3]">{ev.true_duplicates}</div>
            <div className="text-xs text-[#7d8590]">Seeded duplicates</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#76C457]">{ev.detected}</div>
            <div className="text-xs text-[#7d8590]">Detected</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#f85149]">{ev.false_positives}</div>
            <div className="text-xs text-[#7d8590]">False positives</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#ffa600]">{ev.false_negatives}</div>
            <div className="text-xs text-[#7d8590]">Missed</div>
          </div>
        </div>
      </div>

      {/* Benchmark note */}
      <div className="glass-card p-4 border-l-2 border-[#ffa600]">
        <p className="text-xs text-[#7d8590]">
          <span className="text-[#ffa600] font-semibold">Note (ESTIMATE): </span>
          {benchmark._note}
        </p>
      </div>
    </div>
  );
}
