#!/usr/bin/env python3
"""
Download the field officers directory from a published Google Sheet.

Usage:
    python scripts/fetch_field_officers.py --sheet-id <ID> [--gid 0]

The script writes datasets/field-officers.csv and then regenerates the JSON.
"""
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path
import subprocess
import sys

CSV_PATH = Path("datasets/field-officers.csv")


def download_csv(sheet_id: str, gid: str) -> None:
    url = (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?"
        f"tqx=out:csv&gid={gid}"
    )
    with urllib.request.urlopen(url) as resp:
        data = resp.read()
    CSV_PATH.write_bytes(data)
    print(f"Saved {CSV_PATH} ({len(data)} bytes)")


def rebuild_json() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/build_field_officers_json.py"],
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Field Officers directory from Google Sheets.")
    parser.add_argument("--sheet-id", required=True, help="The Google Sheet ID (from the share URL).")
    parser.add_argument("--gid", default="0", help="Worksheet gid (default: 0)")
    args = parser.parse_args()

    download_csv(args.sheet_id, args.gid)
    rebuild_json()


if __name__ == "__main__":
    main()
