#!/usr/bin/env python3
"""
Convert datasets/field-officers.csv -> datasets/field-officers.json
"""
import csv
import json
from pathlib import Path

CSV_PATH = Path("datasets/field-officers.csv")
JSON_PATH = Path("datasets/field-officers.json")

def main() -> None:
    if not CSV_PATH.exists():
        raise SystemExit(f"Missing {CSV_PATH}")

    with CSV_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            rows.append(
                {
                    "province": (row.get("Province/HUC") or "").strip(),
                    "assignment": (row.get("Assignment/Office") or "").strip(),
                    "name": (row.get("Name") or "").strip(),
                    "position": (row.get("Position") or "").strip(),
                    "designation": (row.get("Designation") or "").strip(),
                    "sex": (row.get("Sex") or "").strip(),
                    "contact": (row.get("Contact Information") or "").strip(),
                    "remarks": (row.get("Remarks") or "").strip(),
                }
            )

    JSON_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} records to {JSON_PATH}")


if __name__ == "__main__":
    main()
