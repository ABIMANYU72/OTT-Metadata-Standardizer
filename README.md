# Catalog Quality Checker

> Advanced OTT content-catalog QA tool that detects duplicates and metadata errors using fuzzy matching and ML-assisted scoring, presented in a modern reviewer dashboard.

---

## Architecture

```mermaid
flowchart TD
    A["TMDB API<br/>(~900 titles)"] -->|build_dataset.py| B["ground_truth.json<br/>data/catalog.json"]
    B -->|detector.py| C["Blocking<br/>(prefix + year)"]
    C -->|score_pair()| D["Weighted Scoring<br/>6 signals"]
    D -->|classify| E["4 SOP Categories"]
    E -->|exporter.py| F["web/public/data/\n(JSON artifacts)"]
    F -->|Next.js 14| G["Dashboard"]
    G --> H["Overview KPIs"]
    G --> I["Review Queue"]
    G --> J["Threshold Lab"]
    G --> K["Daily Report xlsx"]
    G --> L["SOP Page"]
```

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))

### Install Python dependencies
```bash
pip install pandas rapidfuzz requests openpyxl pytest
```

### Set your API key
```bash
# Windows PowerShell
$env:TMDB_API_KEY="your_key_here"
# or add to .env file: TMDB_API_KEY=your_key_here
```

### Run the full pipeline (one command)
```bash
python engine/run_pipeline.py
```

This will:
1. Fetch ~900 titles from TMDB API (or load from cache)
2. Build a 1,000-record catalog with 100 seeded duplicates
3. Run duplicate detection + metadata classification
4. Export JSON artifacts to `web/public/data/`

### Run the dashboard
```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

### Run tests
```bash
pytest engine/tests/ -v
```

---

## Results

> Values below are populated from `web/public/data/benchmark.json` after running the pipeline.

| Metric | Value |
|--------|-------|
| Catalog size | 1,000+ records |
| Seeded duplicates | 100 |
| Detection (F1) | *(from benchmark.json)* |
| Precision | *(from benchmark.json)* |
| Recall | *(from benchmark.json)* |
| Pipeline runtime | *(from benchmark.json)* |
| Comparison savings vs n² | *(from benchmark.json)* |
| Time saved *(ESTIMATE)* | *(from benchmark.json — labelled ESTIMATE)* |

---

## Duplicate Corruption Types

| # | Corruption | Example |
|---|-----------|---------|
| 0 | Case change | `THE MATRIX` |
| 1 | Punctuation | `Matrix, The` |
| 2 | Strip article | `Matrix` (from *The Matrix*) |
| 3 | Add article | `The Inception` |
| 4 | Drop subtitle | `Spider-Man` (from *Spider-Man: Homecoming*) |
| 5 | Year suffix | `Inception (2010)` |
| 6 | Year ±1 | `Inception` with year 2011 |
| 7 | Transposition typo | `Incpetion` |
| 8 | Roman → digit | `Toy Story 2` vs `Toy Story II` |
| 9 | Alt-language title | Original language title |

---

## Hard Negatives (must NOT be flagged)

Same-title films from different decades are injected and must not be auto-flagged:

- *The Lion King* (1994) vs *The Lion King* (2019)
- *A Star Is Born* (1937) vs *A Star Is Born* (2018)
- *Ghostbusters* (1984) vs *Ghostbusters* (2016)
- *Beauty and the Beast* (1991) vs *Beauty and the Beast* (2017)
- *Halloween* (1978) vs *Halloween* (2018)

---

## Scoring Weights

| Signal | Weight |
|--------|--------|
| token_set_ratio | 35% |
| WRatio | 25% |
| year_proximity | 15% |
| language_match | 10% |
| runtime_closeness | 10% |
| cast_overlap | 5% |

**Thresholds:** AUTO_FLAG ≥ 0.82 · NEEDS_REVIEW ≥ 0.60 · DISTINCT < 0.60

---

## SOP Issue Categories

| Category | Description |
|----------|-------------|
| DUPLICATE | Same content with varied metadata |
| MISSING_METADATA | Required field null/empty |
| METADATA_MISMATCH | Contradicts TMDB ground truth |
| INVALID_FORMAT | Violates schema (year, runtime, language) |

---

## Limitations

1. **Sampling bias** — Fixed seed (42); production data may have different characteristics
2. **Manual time estimates** — Time-saved figures are ESTIMATES (10s/record assumption), not measured
3. **Offline mode** — Without API key, uses cached `data/ground_truth.json`
4. **CJK/non-Latin scripts** — Normalisation optimised for Latin script; lower recall expected
5. **Cast coverage** — Only top-3 cast from TMDB; ensemble productions have weaker cast signal

---

## Reproducing Results

```bash
# 1. Clone / open project
# 2. Set TMDB_API_KEY
# 3. Run pipeline
python engine/run_pipeline.py

# 4. Run tests
pytest engine/tests/ -v

# 5. View dashboard
cd web && npm run dev
```

To reproduce with a different seed, edit `SEED = 42` in `engine/build_dataset.py`.

---

## Vercel Deployment

Root directory: `/web` · Framework: Next.js · No environment variables required.

---

*This product uses the TMDB API but is not endorsed or certified by TMDB.*
