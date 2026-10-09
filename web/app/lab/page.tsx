"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Scatter, ScatterChart, ZAxis,
} from "recharts";
import { fetchPairScores } from "@/lib/data";
import type { PairScore } from "@/lib/types";

function computePR(pairScores: PairScore[], threshold: number) {
  // We don't have labels here — compute empirical PR based on scoring
  // Using AUTO_FLAG boundary as proxy: score >= threshold → predicted duplicate
  const predicted = pairScores.filter((ps) => ps.composite_score >= threshold);
  const total = pairScores.length;
  return {
    predicted: predicted.length,
    total,
    auto_flagged: pairScores.filter((ps) => ps.composite_score >= 0.82).length,
  };
}

function buildPRCurve(pairScores: PairScore[]) {
  // Build precision-recall curve from 0→1 threshold sweep
  // Since we don't have labels in the browser, we model precision as
  // monotonically increasing near 1 as threshold rises (higher confidence)
  // Recall decreases as threshold rises.
  // Real P/R computed in Python is shown in summary.json; this slider
  // shows how the flagged set changes.
  const points: { threshold: number; flagged: number; pct: number }[] = [];
  for (let t = 0; t <= 100; t += 2) {
    const threshold = t / 100;
    const flagged = pairScores.filter((ps) => ps.composite_score >= threshold).length;
    points.push({
      threshold,
      flagged,
      pct: pairScores.length > 0 ? (flagged / pairScores.length) * 100 : 0,
    });
  }
  return points;
}

export default function LabPage() {
  const [pairScores, setPairScores] = useState<PairScore[]>([]);
  const [threshold, setThreshold] = useState(82);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPairScores().then((ps) => {
      setPairScores(ps);
      setLoading(false);
    });
  }, []);

  const curve = useMemo(() => buildPRCurve(pairScores), [pairScores]);

  const currentT = threshold / 100;
  const flagged = pairScores.filter((ps) => ps.composite_score >= currentT);
  const needsReview = pairScores.filter(
    (ps) => ps.composite_score >= 0.6 && ps.composite_score < currentT
  );

  // Score distribution
  const bins: Record<string, number> = {};
  for (let b = 0; b < 10; b++) {
    const key = `${b * 10}–${b * 10 + 10}%`;
    bins[key] = 0;
  }
  pairScores.forEach((ps) => {
    const b = Math.min(9, Math.floor(ps.composite_score * 10));
    const key = `${b * 10}–${b * 10 + 10}%`;
    bins[key] = (bins[key] || 0) + 1;
  });
  const distData = Object.entries(bins).map(([name, count]) => ({ name, count }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#76C457] border-t-transparent animate-spin" />
          <p className="text-[#7d8590] text-sm">Loading pair scores…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Threshold Lab</h1>
        <p className="text-[#7d8590] text-sm mt-1">
          Drag the slider to see how the AUTO_FLAG threshold affects detection coverage
        </p>
      </div>

      {/* Threshold slider */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-[#e6edf3]">AUTO_FLAG Threshold</div>
            <div className="text-xs text-[#7d8590]">Pairs above this score are auto-flagged as duplicates</div>
          </div>
          <div className="text-3xl font-bold" style={{ color: "#76C457" }}>
            {threshold}%
          </div>
        </div>
        <input
          id="threshold-slider"
          type="range"
          min={50}
          max={100}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #2A7C13 0%, #76C457 ${threshold - 50}%, #21262d ${threshold - 50}%, #21262d 100%)`,
          }}
        />
        <div className="flex justify-between text-xs text-[#7d8590] mt-2">
          <span>50% (low precision)</span>
          <span>100% (high precision)</span>
        </div>

        {/* Live metrics */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          <div className="bg-[#0d1117] rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-[#f85149]">{flagged.length}</div>
            <div className="text-xs text-[#7d8590] mt-1">AUTO_FLAG pairs</div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-[#ffa600]">{needsReview.length}</div>
            <div className="text-xs text-[#7d8590] mt-1">NEEDS_REVIEW pairs</div>
          </div>
          <div className="bg-[#0d1117] rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-[#76C457]">
              {pairScores.length - flagged.length - needsReview.length}
            </div>
            <div className="text-xs text-[#7d8590] mt-1">DISTINCT pairs</div>
          </div>
        </div>
      </div>

      {/* Score distribution + threshold curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Flagged Pairs vs Threshold</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={curve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis
                dataKey="threshold"
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={{ fontSize: 11, fill: "#7d8590" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#7d8590" }} />
              <Tooltip
                formatter={(v: any) => [`${v}`, "Flagged pairs"]}
                labelFormatter={(l: any) => `Threshold: ${Math.round(l * 100)}%`}
                contentStyle={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8 }}
              />
              <ReferenceLine
                x={currentT}
                stroke="#76C457"
                strokeDasharray="4 4"
                label={{ value: `${threshold}%`, fill: "#76C457", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="flagged"
                stroke="#76C457"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Score Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={distData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#7d8590" }} />
              <YAxis tick={{ fontSize: 11, fill: "#7d8590" }} />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="count" stroke="#569cd6" strokeWidth={2} dot={{ fill: "#569cd6", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pair table at current threshold */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[#21262d] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#e6edf3]">
            Auto-flagged pairs at {threshold}% threshold
          </h2>
          <span className="badge badge-critical">{flagged.length} pairs</span>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID A</th>
                <th>Title A</th>
                <th>ID B</th>
                <th>Title B</th>
                <th>Score</th>
                <th>Year A</th>
                <th>Year B</th>
              </tr>
            </thead>
            <tbody>
              {flagged.slice(0, 50).map((ps, i) => (
                <tr key={i}>
                  <td className="font-mono text-xs text-[#7d8590]">{ps.id_a}</td>
                  <td className="text-xs text-[#e6edf3] max-w-32 truncate">{ps.title_a}</td>
                  <td className="font-mono text-xs text-[#7d8590]">{ps.id_b}</td>
                  <td className="text-xs text-[#e6edf3] max-w-32 truncate">{ps.title_b}</td>
                  <td>
                    <span
                      className="font-mono text-xs font-bold"
                      style={{ color: ps.composite_score >= 0.9 ? "#f85149" : ps.composite_score >= 0.8 ? "#ffa600" : "#76C457" }}
                    >
                      {Math.round(ps.composite_score * 100)}%
                    </span>
                  </td>
                  <td className="text-xs text-[#7d8590]">{ps.year_a ?? "—"}</td>
                  <td className="text-xs text-[#7d8590]">{ps.year_b ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
