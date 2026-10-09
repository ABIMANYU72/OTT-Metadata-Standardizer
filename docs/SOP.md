# Catalog Quality Checker — Standard Operating Procedures

## Overview

This SOP defines the four issue categories used by the Catalog Quality Checker tool. Every issue detected by the engine is classified into exactly one category. Each category has defined severity levels, evidence requirements, and a recommended action.

---

## Issue Categories

### 1. DUPLICATE

**Definition:** Two or more catalog records that refer to the same content item (same title, same production year, substantially same metadata).

**Severity:**
- **CRITICAL** — Auto-flagged with composite score ≥ 0.82; system is highly confident.
- **HIGH** — Needs-review with composite score ≥ 0.60; human confirmation required.

**Evidence required:**
- Composite similarity score
- Per-signal breakdown (token_set_ratio, WRatio, year_proximity, language_match, runtime_closeness, cast_overlap)
- Both record IDs, titles, and release years

**Suggested action:**
> Review the pair side-by-side. Merge into a single canonical record, preserving the richer metadata. Remove the weaker duplicate. If they are genuinely different (e.g., remake from a different decade), mark as DISTINCT and add to the hard-negative list.

**Hard negatives (must NOT be flagged):**
- Remakes with year difference > 5 years (e.g., *The Lion King* 1994 vs. 2019)
- Sequels with different subtitles (e.g., *Spider-Man* vs. *Spider-Man: Homecoming*)
- Same franchise, clearly different installments

---

### 2. MISSING_METADATA

**Definition:** A required or recommended field is null, empty, or absent for a record.

**Severity:**
- **CRITICAL** — `title` is missing; record is unusable.
- **HIGH** — `year` or `language` is missing; critical for search and rights.
- **MEDIUM** — `genres` or `synopsis` is missing; impacts discoverability.
- **LOW** — `cast`, `certification` is missing; nice-to-have for UX.

**Evidence required:**
- Field name
- Current value (null / empty string / [])
- Record ID and title

**Suggested action:**
> Enrich the record from the TMDB API using the `tmdb_id` field. If `tmdb_id` is unavailable, search TMDB by title and year. Escalate to data team if the field cannot be recovered.

---

### 3. METADATA_MISMATCH

**Definition:** A field value in the catalog contradicts the value from the TMDB ground truth by more than the allowed tolerance.

**Tolerance thresholds:**
- `year`: difference > 1 year
- `language`: any mismatch
- `runtime`: difference > 15 minutes

**Severity:** **HIGH** (all mismatches are high severity since they indicate data corruption)

**Evidence required:**
- Field name
- Catalog value vs. TMDB value
- TMDB ID for cross-reference
- Record ID and title

**Suggested action:**
> Cross-check the catalog record against TMDB using the `tmdb_id`. Update the field to match the authoritative TMDB value. Document the source of the original incorrect value for root-cause analysis.

---

### 4. INVALID_FORMAT

**Definition:** A field value violates the expected schema, regardless of whether it is present.

**Schema rules:**
| Field | Expected Format | Examples of invalid values |
|-------|----------------|---------------------------|
| `year` | Integer, 1900–2100 | `"20211"`, `"199X"`, `"abcd"`, `-1` |
| `runtime` | Positive integer, 1–600 | `-5`, `0`, `9999`, `"ninety"` |
| `language` | ISO 639-1 two-letter code | `"english"`, `"ENG"`, `"en-US-invalid"` |

**Severity:**
- **HIGH** — `year` invalid; breaks search and sorting.
- **MEDIUM** — `runtime` invalid.
- **LOW** — `language` format invalid.

**Evidence required:**
- Field name
- Current (invalid) value
- Expected format description
- Record ID and title

**Suggested action:**
> Correct the field to comply with the schema. For `year`, parse from the original source string. For `runtime`, convert from minutes or obtain from TMDB. For `language`, map to the ISO 639-1 code.

---

## Scoring & Thresholds

### Duplicate Detection Signals

| Signal | Weight | Description |
|--------|--------|-------------|
| `token_set_ratio` | 35% | Token-set fuzzy match on normalised title |
| `wratio` | 25% | Weighted ratio fuzzy match on normalised title |
| `year_proximity` | 15% | Decays linearly; 0 score at 5+ year difference |
| `language_match` | 10% | Binary: 1 if same language code |
| `runtime_closeness` | 10% | Decays linearly; 0 score at 60+ min difference |
| `cast_overlap` | 5% | Jaccard similarity of top-3 cast names |

### Verdict Thresholds

| Verdict | Composite Score | Action |
|---------|----------------|--------|
| `AUTO_FLAG` | ≥ 0.82 | Automatically queued as DUPLICATE (CRITICAL) |
| `NEEDS_REVIEW` | 0.60–0.82 | Added to review queue (HIGH) |
| `DISTINCT` | < 0.60 | Not a duplicate; may still have other issues |

---

## Title Normalisation Pipeline

Before comparison, all titles pass through this pipeline:

1. Strip year suffix (e.g., `" (2021)"`)
2. Lowercase
3. Decompose Unicode accents (NFD → strip combining chars)
4. Remove punctuation
5. Strip leading articles (`the`, `a`, `an`)
6. Replace Roman numerals with digits (I→1, II→2, …)
7. Replace number words with digits (one→1, two→2, …)
8. Collapse whitespace

---

## Blocking Strategy

To avoid O(n²) comparisons, we use inverted-index blocking:
- **Key type 1:** Normalised title prefix (first 4 characters)
- **Key type 2:** Prefix + year (±1 year window)

Records sharing a block key become candidate pairs. All others are assumed DISTINCT without comparison.

---

## Daily Report Contents

The exported `.xlsx` report contains three sheets:

| Sheet | Contents |
|-------|---------|
| **Summary** | KPIs: total records, issues per category, detection metrics |
| **Issues** | Full issue list with ID, category, severity, evidence, action |
| **Activity Log** | Reviewer decisions (Accept/Reject/Escalate), timestamps, accuracy % |

---

## Reviewer Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `J` | Next record in queue |
| `K` | Previous record in queue |
| `A` | Accept (mark as resolved / not a real issue) |
| `R` | Reject (confirm as genuine issue) |
| `E` | Escalate to senior reviewer |

---

## Limitations

1. **Sampling:** The dataset uses a fixed random seed (42). Results will vary on production data.
2. **Manual estimates:** Time-saved figures are ESTIMATES based on a documented constant (10 seconds/record), not measured analyst time.
3. **TMDB dependency:** Metadata mismatch detection requires a valid TMDB API key for initial ground-truth fetch. Offline mode uses the cached `ground_truth.json`.
4. **Language bias:** Normalisation is optimised for Latin-script titles. CJK, Arabic, and Devanagari scripts may have lower recall.
5. **Cast data:** Only top-3 cast members are used; cast overlap signal may be unreliable for ensemble productions.

---

*This product uses the TMDB API but is not endorsed or certified by TMDB.*
