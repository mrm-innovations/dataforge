#!/usr/bin/env python3
"""
Build lg-audits.json from Google Sheet exports.
"""
import csv
import json
import re
from pathlib import Path

DEMOGRAPHY_CSV = Path("datasets/demography.csv")
OUTPUT_JSON = Path("lg-audits.json")
AUDIT_SHEETS = {
    "ADAC": {
        "path": Path("datasets/adac.csv"),
        "metric": "score",
        "years": [2019, 2020, 2021, 2022, 2023, 2024],
    },
    "SGLG": {
        "path": Path("datasets/sglg.csv"),
        "metric": "status",
        "years": [2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024],
    },
    "POC": {
        "path": Path("datasets/poc.csv"),
        "metric": "score",
        "years": [2021, 2022, 2023],
    },
    "LCPC": {
        "path": Path("datasets/lcpc.csv"),
        "metric": "score",
        "years": [2022, 2023, 2024],
    },
}
REGION_NAME = "REGION 12"


def normalize(value: str | None) -> str:
    base = (value or "").lower()
    base = base.replace("city of ", "")
    return re.sub(r"[^a-z0-9]+", "", base)


def to_number(value: str):
    clean = value.replace(",", "").strip()
    if not clean:
        return None
    try:
        return float(clean)
    except ValueError:
        return None


def extract_years(fieldnames):
    years = []
    for name in fieldnames or []:
        raw = (name or "").strip()
        if raw.isdigit() and len(raw) == 4:
            year = int(raw)
            if 1900 <= year <= 2100:
                years.append(year)
    return sorted(set(years))


def load_audit(path: Path, fallback_years):
    if not path.exists():
        return {}, fallback_years
    mapping = {}
    with path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        years = extract_years(reader.fieldnames)
        if not years:
            years = fallback_years
        for row in reader:
            province = row.get("Province") or row.get("PROVINCE") or row.get("province")
            lgu = row.get("LGU") or row.get("Lgu") or row.get("lgu")
            key = f"{normalize(province)}|{normalize(lgu)}"
            if not key.strip("|"):
                continue
            result = {}
            for year in years:
                raw = (row.get(str(year)) or "").strip()
                if raw:
                    result[str(year)] = raw
            if result:
                mapping[key] = result
    return mapping, years


def load_demography():
    if not DEMOGRAPHY_CSV.exists():
        raise SystemExit("Missing datasets/demography.csv")
    rows = []
    with DEMOGRAPHY_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            province = (row.get("Province") or "").strip()
            lgu = (row.get("LGU") or "").strip()
            if not (province and lgu):
                continue
            pop_raw = (row.get("Population (2020 Census)") or "").replace(",", "").strip()
            population = int(pop_raw) if pop_raw.isdigit() else to_number(pop_raw)
            rows.append(
                {
                    "psgc": (row.get("PSGC") or "").strip(),
                    "region": REGION_NAME,
                    "province": province,
                    "lgu": lgu,
                    "type": (row.get("Type") or "").strip(),
                    "income_class": (row.get("Income Class") or "").strip(),
                    "population": population if population is not None else None,
                    "results": {},
                }
            )
    return rows


def main():
    demography = load_demography()
    audit_maps = {}
    audit_years = {}
    for key, meta in AUDIT_SHEETS.items():
        mapping, years = load_audit(meta["path"], meta["years"])
        audit_maps[key] = mapping
        audit_years[key] = years

    for entry in demography:
        key = f"{normalize(entry['province'])}|{normalize(entry['lgu'])}"
        for audit_key, result_map in audit_maps.items():
            results = result_map.get(key)
            if not results:
                continue
            metric = AUDIT_SHEETS[audit_key]["metric"]
            if metric == "score":
                numeric = {}
                for year, value in results.items():
                    num = to_number(value)
                    if num is not None:
                        numeric[year] = num
                if numeric:
                    entry["results"][audit_key] = numeric
            else:
                entry["results"][audit_key] = results

    meta = {
        "audits": {
            "ADAC": {
                "years": audit_years["ADAC"],
                "metric": "score",
                "bands": {"high_functional": 85, "moderate_functional": 50},
                "labels": {
                    "band_high": "High Functional",
                    "band_moderate": "Moderate Functional",
                    "band_low": "Low Functional",
                },
            },
            "SGLG": {
                "years": audit_years["SGLG"],
                "metric": "status",
                "status_values": ["Passer", "Non-Passer"],
            },
            "POC": {"years": audit_years["POC"], "metric": "score"},
            "LCPC": {"years": audit_years["LCPC"], "metric": "score"},
        },
        "region": REGION_NAME,
    }

    OUTPUT_JSON.write_text(json.dumps({"meta": meta, "lgus": demography}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(demography)} entries to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
