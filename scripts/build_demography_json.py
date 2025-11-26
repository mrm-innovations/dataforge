#!/usr/bin/env python3
import csv
import json
from pathlib import Path

CSV_PATH = Path("datasets/demography.csv")
JSON_PATH = Path("public/demography.json")


def to_int(value: str):
    clean = value.replace(",", "").strip()
    if not clean:
        return None
    try:
        return int(clean)
    except ValueError:
        return None


def main():
    rows = []
    with CSV_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not (row.get("Province") and row.get("LGU")):
                continue
            rows.append(
                {
                    "psgc": (row.get("PSGC") or "").strip(),
                    "province": (row.get("Province") or "").strip(),
                    "lgu": (row.get("LGU") or "").strip(),
                    "type": (row.get("Type") or "").strip(),
                    "income_class": (row.get("Income Class") or "").strip(),
                    "population": to_int(row.get("Population (2020 Census)") or ""),
                }
            )
    JSON_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(rows)} records to {JSON_PATH}")


if __name__ == "__main__":
    main()
