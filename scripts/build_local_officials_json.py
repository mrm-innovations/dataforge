import csv
import json
import re
from pathlib import Path

CSV_PATH = Path("datasets/local-officials.csv")
JSON_PATH = Path("datasets/local-officials-2025.json")

SUFFIXES = {"JR", "JR.", "II", "III", "IV"}


def split_name(full_name: str):
    full = full_name.replace(",", " ").strip()
    if not full:
        return "", "", ""
    tokens = [tok for tok in full.split() if tok]
    suffix = ""
    if tokens and tokens[-1].upper().rstrip(".") in SUFFIXES:
        suffix = tokens.pop()
    mi_index = None
    for idx, token in enumerate(tokens[:-1]):
        if re.fullmatch(r"[A-Za-z]\.?+", token):
            mi_index = idx
            break
    if mi_index is not None:
        first_tokens = tokens[:mi_index]
        middle_initial = tokens[mi_index].replace(".", "").upper()
        last_tokens = tokens[mi_index + 1 :]
    else:
        first_tokens = tokens[:-1]
        middle_initial = ""
        last_tokens = tokens[-1:]
    first_name = " ".join(first_tokens).strip()
    if not first_name and tokens:
        first_name = tokens[0]
    last_name = " ".join(last_tokens + ([suffix] if suffix else [])).strip()
    return first_name, middle_initial, last_name


def main():
    rows = []
    with CSV_PATH.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            province = (row.get("Province") or "").strip()
            if not province:
                continue
            first, middle, last = split_name(row.get("Name") or "")
            rows.append(
                {
                    "province": province,
                    "lgu": (row.get("LGU") or "").strip(),
                    "position": (row.get("Position") or "").strip(),
                    "first_name": first,
                    "middle_initial": middle,
                    "last_name": last,
                    "sex": (row.get("Sex") or "").strip(),
                    "party": (row.get("Party") or "").strip(),
                    "term": (row.get("Term") or "").strip(),
                }
            )
    JSON_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(rows)} records to {JSON_PATH}")


if __name__ == "__main__":
    main()
