// lib/data.ts — Data fetching utilities (client-side)

import type { Summary, Issue, PairScore, Benchmark, CatalogRecord } from "./types";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchSummary(): Promise<Summary> {
  return fetchJson<Summary>("/data/summary.json");
}

export async function fetchIssues(): Promise<Issue[]> {
  return fetchJson<Issue[]>("/data/issues.json");
}

export async function fetchPairScores(): Promise<PairScore[]> {
  return fetchJson<PairScore[]>("/data/pair_scores.json");
}

export async function fetchBenchmark(): Promise<Benchmark> {
  return fetchJson<Benchmark>("/data/benchmark.json");
}

export async function fetchCatalogSample(): Promise<CatalogRecord[]> {
  return fetchJson<CatalogRecord[]>("/data/catalog_sample.json");
}

export function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs.toFixed(1)}s`;
  if (secs < 3600) return `${(secs / 60).toFixed(1)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
