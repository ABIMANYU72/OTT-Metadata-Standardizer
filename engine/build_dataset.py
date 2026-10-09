"""
build_dataset.py
================
Phase 1: Fetch ~900 real movies/TV titles from TMDB API, build a 1,000-record
catalog with exactly 100 seeded duplicates, ~15% metadata defects, and hard
negatives (remakes/sequels that must NOT be flagged).

Usage:
    python engine/build_dataset.py
    TMDB_API_KEY=xxx python engine/build_dataset.py
"""
from __future__ import annotations

import json
import os
import random
import re
import time
from pathlib import Path
from typing import Any

import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
GROUND_TRUTH_FILE = DATA_DIR / "ground_truth.json"
CATALOG_FILE = DATA_DIR / "catalog.json"
LABELS_FILE = DATA_DIR / "seeded_labels.json"

SEED = 42
TARGET_TITLES = 900
CATALOG_SIZE = 1000
NUM_DUPLICATES = 100
DEFECT_RATE = 0.15

TMDB_BASE = "https://api.themoviedb.org/3"


# ---------------------------------------------------------------------------
# TMDB helpers
# ---------------------------------------------------------------------------

def _get_api_key() -> str | None:
    key = os.getenv("TMDB_API_KEY")
    if key:
        return key
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("TMDB_API_KEY="):
                return line.split("=", 1)[1].strip()
    return None


def _tmdb_get(path: str, api_key: str, params: dict | None = None) -> dict:
    p = {"api_key": api_key, **(params or {})}
    r = requests.get(f"{TMDB_BASE}{path}", params=p, timeout=15)
    r.raise_for_status()
    return r.json()


def _fetch_cast(media_type: str, tmdb_id: int, api_key: str) -> list[str]:
    try:
        data = _tmdb_get(f"/{media_type}/{tmdb_id}/credits", api_key)
        cast = data.get("cast", [])
        return [c["name"] for c in cast[:3]]
    except Exception:
        return []


def _fetch_cert(media_type: str, tmdb_id: int, api_key: str) -> str:
    try:
        if media_type == "movie":
            data = _tmdb_get(f"/movie/{tmdb_id}/release_dates", api_key)
            for result in data.get("results", []):
                if result.get("iso_3166_1") == "US":
                    for rd in result.get("release_dates", []):
                        cert = rd.get("certification", "")
                        if cert:
                            return cert
        else:
            data = _tmdb_get(f"/tv/{tmdb_id}/content_ratings", api_key)
            for result in data.get("results", []):
                if result.get("iso_3166_1") == "US":
                    return result.get("rating", "")
    except Exception:
        pass
    return ""


def _record_from_tmdb(raw: dict, media_type: str, api_key: str) -> dict:
    tmdb_id = raw["id"]
    if media_type == "movie":
        title = raw.get("title", "")
        original_title = raw.get("original_title", "")
        year_str = raw.get("release_date", "")[:4]
        runtime = raw.get("runtime") or raw.get("episode_run_time", [None])[0]
    else:
        title = raw.get("name", "")
        original_title = raw.get("original_name", "")
        year_str = raw.get("first_air_date", "")[:4]
        rt_list = raw.get("episode_run_time", [])
        runtime = rt_list[0] if rt_list else None

    genres = [g["name"] for g in raw.get("genres", raw.get("genre_ids_resolved", []))]
    if not genres and "genre_ids" in raw:
        genres = []  # will be resolved later from genre list

    synopsis = raw.get("overview", "")
    language = raw.get("original_language", "en")

    cast = _fetch_cast(media_type, tmdb_id, api_key)
    cert = _fetch_cert(media_type, tmdb_id, api_key)

    try:
        year = int(year_str) if year_str else None
    except ValueError:
        year = None

    return {
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "title": title,
        "original_title": original_title,
        "year": year,
        "genres": genres,
        "language": language,
        "runtime": runtime,
        "cast": cast,
        "synopsis": synopsis,
        "certification": cert,
    }


def fetch_tmdb_titles(api_key: str) -> list[dict]:
    """Fetch ~900 real titles from TMDB popular + top_rated endpoints."""
    print("Fetching TMDB titles…")
    genre_map: dict[int, str] = {}
    for gm_path in ["/genre/movie/list", "/genre/tv/list"]:
        try:
            gd = _tmdb_get(gm_path, api_key)
            for g in gd.get("genres", []):
                genre_map[g["id"]] = g["name"]
        except Exception:
            pass

    all_raw: list[tuple[dict, str]] = []
    endpoints = [
        ("movie", "popular"),
        ("movie", "top_rated"),
        ("tv", "popular"),
        ("tv", "top_rated"),
    ]
    for media_type, category in endpoints:
        pages_needed = 12  # ~240 results per endpoint × 4 = 960
        for page in range(1, pages_needed + 1):
            try:
                data = _tmdb_get(f"/{media_type}/{category}", api_key, {"page": page})
                for item in data.get("results", []):
                    # resolve genres
                    item["genres"] = [
                        {"name": genre_map.get(gid, str(gid))}
                        for gid in item.get("genre_ids", [])
                    ]
                    item["genre_ids_resolved"] = item["genres"]
                    all_raw.append((item, media_type))
                time.sleep(0.05)  # stay within rate limit
            except Exception as e:
                print(f"  Warning: {media_type}/{category} page {page}: {e}")
                break

    # Deduplicate by tmdb_id
    seen: set[int] = set()
    unique_raw: list[tuple[dict, str]] = []
    for item, mtype in all_raw:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique_raw.append((item, mtype))

    print(f"  Unique raw titles: {len(unique_raw)}")

    # Convert to records (lightweight — no extra API calls for now)
    records: list[dict] = []
    for item, mtype in unique_raw[:TARGET_TITLES]:
        rec = {
            "tmdb_id": item["id"],
            "media_type": mtype,
            "title": item.get("title") or item.get("name", ""),
            "original_title": item.get("original_title") or item.get("original_name", ""),
            "year": None,
            "genres": [g["name"] if isinstance(g, dict) else g for g in item.get("genre_ids_resolved", [])],
            "language": item.get("original_language", "en"),
            "runtime": None,
            "cast": [],
            "synopsis": item.get("overview", ""),
            "certification": "",
        }
        date = item.get("release_date") or item.get("first_air_date") or ""
        if date:
            try:
                rec["year"] = int(date[:4])
            except ValueError:
                pass
        records.append(rec)

    # Enrich with cast for first 200 (to keep fetch time reasonable)
    print("  Enriching cast for first 200 records…")
    for rec in records[:200]:
        try:
            rec["cast"] = _fetch_cast(rec["media_type"], rec["tmdb_id"], api_key)
            time.sleep(0.05)
        except Exception:
            pass

    return records


# ---------------------------------------------------------------------------
# Corruption helpers (for seeded duplicates)
# ---------------------------------------------------------------------------

def _strip_articles(title: str) -> str:
    return re.sub(r'^(The|A|An)\s+', '', title, flags=re.I).strip()


def _add_article(title: str) -> str:
    return f"The {title}"


def _case_corrupt(title: str, rng: random.Random) -> str:
    ops = [str.upper, str.lower, str.title]
    return rng.choice(ops)(title)


def _punct_corrupt(title: str, rng: random.Random) -> str:
    replacements = {":": " -", "&": "and", "'": "", "-": " ", ".": ""}
    for ch, rep in replacements.items():
        if ch in title:
            return title.replace(ch, rep, 1)
    return title + "!"


def _drop_subtitle(title: str) -> str:
    for sep in [":", " -", " –"]:
        if sep in title:
            return title.split(sep)[0].strip()
    return title


def _year_suffix(title: str, year: int | None) -> str:
    if year:
        return f"{title} ({year})"
    return title


def _year_off_by_one(rec: dict, rng: random.Random) -> dict:
    r = dict(rec)
    if r.get("year"):
        r["year"] = r["year"] + rng.choice([-1, 1])
    return r


def _typo(title: str, rng: random.Random) -> str:
    if len(title) < 3:
        return title
    i = rng.randint(1, len(title) - 2)
    chars = list(title)
    chars[i], chars[i + 1] = chars[i + 1], chars[i]
    return "".join(chars)


ROMAN = {"I": "1", "II": "2", "III": "3", "IV": "4", "V": "5",
         "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10"}
DIGIT_TO_ROMAN = {v: k for k, v in ROMAN.items()}


def _roman_to_digit(title: str) -> str:
    for rom, dig in ROMAN.items():
        pattern = rf'\b{re.escape(rom)}\b'
        if re.search(pattern, title):
            return re.sub(pattern, dig, title)
    return title


def _alt_lang_title(rec: dict, rng: random.Random) -> str:
    """Return original_title if different, else add a fake transliteration."""
    if rec.get("original_title") and rec["original_title"] != rec["title"]:
        return rec["original_title"]
    # Fake transliteration: swap vowels
    vowels = "aeiouAEIOU"
    title = rec["title"]
    result = []
    for ch in title:
        if ch in vowels:
            result.append(rng.choice(list(vowels.lower())))
        else:
            result.append(ch)
    return "".join(result)


CORRUPTION_FUNCS = [
    lambda rec, rng: {**rec, "title": _case_corrupt(rec["title"], rng)},
    lambda rec, rng: {**rec, "title": _punct_corrupt(rec["title"], rng)},
    lambda rec, rng: {**rec, "title": _strip_articles(rec["title"])},
    lambda rec, rng: {**rec, "title": _add_article(rec["title"])},
    lambda rec, rng: {**rec, "title": _drop_subtitle(rec["title"])},
    lambda rec, rng: {**rec, "title": _year_suffix(rec["title"], rec.get("year"))},
    lambda rec, rng: _year_off_by_one(rec, rng),
    lambda rec, rng: {**rec, "title": _typo(rec["title"], rng)},
    lambda rec, rng: {**rec, "title": _roman_to_digit(rec["title"])},
    lambda rec, rng: {**rec, "title": _alt_lang_title(rec, rng)},
]


# ---------------------------------------------------------------------------
# Metadata defect injectors
# ---------------------------------------------------------------------------

INVALID_YEARS = ["20211", "199X", "abcd", "0"]
INVALID_RUNTIMES = [-5, -1, 0, 9999]


def _inject_defects(records: list[dict], rng: random.Random) -> list[dict]:
    """Inject ~15% metadata defects in-place."""
    n_defects = int(len(records) * DEFECT_RATE)
    defect_indices = rng.sample(range(len(records)), n_defects)

    defect_types = [
        "missing_title",
        "missing_year",
        "missing_synopsis",
        "wrong_language",
        "invalid_year_format",
        "missing_genres",
        "negative_runtime",
        "invalid_runtime_format",
        "missing_certification",
        "wrong_year",
    ]

    for idx in defect_indices:
        rec = records[idx]
        dtype = rng.choice(defect_types)
        if dtype == "missing_title":
            rec["title"] = ""
        elif dtype == "missing_year":
            rec["year"] = None
        elif dtype == "missing_synopsis":
            rec["synopsis"] = ""
        elif dtype == "wrong_language":
            langs = ["fr", "de", "es", "ja", "ko", "hi", "pt", "zh"]
            rec["language"] = rng.choice([l for l in langs if l != rec.get("language")])
        elif dtype == "invalid_year_format":
            rec["year"] = rng.choice(INVALID_YEARS)
        elif dtype == "missing_genres":
            rec["genres"] = []
        elif dtype == "negative_runtime":
            rec["runtime"] = rng.choice(INVALID_RUNTIMES)
        elif dtype == "invalid_runtime_format":
            rec["runtime"] = "ninety"
        elif dtype == "missing_certification":
            rec["certification"] = None
        elif dtype == "wrong_year":
            if isinstance(rec.get("year"), int):
                rec["year"] = rec["year"] + rng.randint(5, 20)
        rec["_injected_defect"] = dtype
    return records


# ---------------------------------------------------------------------------
# Hard negatives (remakes / sequels — must NOT be flagged as duplicates)
# ---------------------------------------------------------------------------

HARD_NEGATIVES = [
    # (title1, year1, title2, year2, reason)
    ("The Lion King", 1994, "The Lion King", 2019, "remake"),
    ("A Star Is Born", 1937, "A Star Is Born", 2018, "remake"),
    ("Beauty and the Beast", 1991, "Beauty and the Beast", 2017, "remake"),
    ("Cinderella", 1950, "Cinderella", 2015, "remake"),
    ("Ghostbusters", 1984, "Ghostbusters", 2016, "remake"),
    ("IT", 1990, "IT", 2017, "remake"),
    ("The Italian Job", 1969, "The Italian Job", 2003, "remake"),
    ("Ocean's Eleven", 1960, "Ocean's Eleven", 2001, "remake"),
    ("Spider-Man", 2002, "Spider-Man: Homecoming", 2017, "different_subtitle"),
    ("Halloween", 1978, "Halloween", 2018, "sequel"),
]


def _inject_hard_negatives(records: list[dict], rng: random.Random, start_id: int) -> tuple[list[dict], list[dict]]:
    negatives = []
    for i, (t1, y1, t2, y2, reason) in enumerate(HARD_NEGATIVES):
        r1 = {
            "tmdb_id": -(start_id + i * 2 + 1),
            "media_type": "movie",
            "title": t1,
            "original_title": t1,
            "year": y1,
            "genres": ["Drama"],
            "language": "en",
            "runtime": 120,
            "cast": [],
            "synopsis": f"Hard negative: {reason}",
            "certification": "PG-13",
            "_hard_negative": True,
            "_hard_negative_reason": reason,
        }
        r2 = {
            "tmdb_id": -(start_id + i * 2 + 2),
            "media_type": "movie",
            "title": t2,
            "original_title": t2,
            "year": y2,
            "genres": ["Drama"],
            "language": "en",
            "runtime": 115,
            "cast": [],
            "synopsis": f"Hard negative: {reason}",
            "certification": "PG-13",
            "_hard_negative": True,
            "_hard_negative_reason": reason,
        }
        negatives.extend([r1, r2])
    return records, negatives


# ---------------------------------------------------------------------------
# Main catalog builder
# ---------------------------------------------------------------------------

def build_catalog(ground_truth: list[dict]) -> tuple[list[dict], dict]:
    rng = random.Random(SEED)

    # Base pool: use up to (CATALOG_SIZE - NUM_DUPLICATES) unique titles
    base_pool = ground_truth[:CATALOG_SIZE - NUM_DUPLICATES]

    # Assign catalog IDs
    catalog: list[dict] = []
    for i, rec in enumerate(base_pool):
        r = dict(rec)
        r["catalog_id"] = f"C{i+1:04d}"
        catalog.append(r)

    # Pick 100 source records for duplication
    dup_sources = rng.choices(catalog[:min(800, len(catalog))], k=NUM_DUPLICATES)

    # Labels: mapping from dup catalog_id → original catalog_id
    dup_records: list[dict] = []
    labels: dict[str, Any] = {"duplicates": [], "defects": []}
    dup_start_id = len(catalog) + 1

    for j, src in enumerate(dup_sources):
        corr_func = CORRUPTION_FUNCS[j % len(CORRUPTION_FUNCS)]
        dup = corr_func(dict(src), rng)
        dup["catalog_id"] = f"D{j+1:04d}"
        dup["_is_dup"] = True
        dup["_dup_of"] = src["catalog_id"]
        dup["_corruption_type"] = corr_func.__name__ if hasattr(corr_func, "__name__") else f"type_{j % len(CORRUPTION_FUNCS)}"
        dup_records.append(dup)
        labels["duplicates"].append({
            "dup_id": dup["catalog_id"],
            "original_id": src["catalog_id"],
            "corruption_index": j % len(CORRUPTION_FUNCS),
        })

    # Inject defects into catalog (not dups, so detector has clean signal)
    catalog = _inject_defects(catalog, rng)
    for rec in catalog:
        if "_injected_defect" in rec:
            labels["defects"].append({
                "catalog_id": rec["catalog_id"],
                "defect_type": rec["_injected_defect"],
            })

    # Hard negatives
    catalog, hn_records = _inject_hard_negatives(catalog, rng, dup_start_id + NUM_DUPLICATES)
    for i, hn in enumerate(hn_records):
        hn["catalog_id"] = f"HN{i+1:02d}"

    # Assemble final catalog
    full_catalog = catalog + dup_records + hn_records

    # Shuffle
    rng.shuffle(full_catalog)

    return full_catalog, labels


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    api_key = _get_api_key()

    if api_key and not GROUND_TRUTH_FILE.exists():
        print("API key found — fetching from TMDB…")
        ground_truth = fetch_tmdb_titles(api_key)
        GROUND_TRUTH_FILE.write_text(json.dumps(ground_truth, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f"Saved {len(ground_truth)} records to {GROUND_TRUTH_FILE}")
    elif GROUND_TRUTH_FILE.exists():
        print(f"Loading cached ground truth from {GROUND_TRUTH_FILE}")
        ground_truth = json.loads(GROUND_TRUTH_FILE.read_text(encoding='utf-8'))
    else:
        raise RuntimeError(
            "No TMDB_API_KEY set and no cached ground_truth.json found. "
            "Set the API key or provide a cache file."
        )

    print(f"Ground truth size: {len(ground_truth)}")
    catalog, labels = build_catalog(ground_truth)
    print(f"Catalog size: {len(catalog)}")

    CATALOG_FILE.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding='utf-8')
    LABELS_FILE.write_text(json.dumps(labels, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"Saved catalog to {CATALOG_FILE}")
    print(f"Saved labels to {LABELS_FILE} (hidden answer key — detector never reads this)")


if __name__ == "__main__":
    main()
