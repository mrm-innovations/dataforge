#!/usr/bin/env python3
"""
Download the Local Officials dataset from Google Sheets.
"""

import argparse
import subprocess
import sys
import urllib.request
from pathlib import Path

CSV_PATH = Path("datasets/local-officials.csv")


def download_csv(sheet_id: str, gid: str) -> None:
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}"
    with urllib.request.urlopen(url) as resp:
        CSV_PATH.write_bytes(resp.read())
    print(f"Saved {CSV_PATH}")


def rebuild_json() -> None:
    result = subprocess.run([sys.executable, "scripts/build_local_officials_json.py"], check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Local Officials directory from Google Sheets.")
    parser.add_argument("--sheet-id", required=True)
    parser.add_argument("--gid", default="0")
    args = parser.parse_args()
    download_csv(args.sheet_id, args.gid)
    rebuild_json()


if __name__ == "__main__":
    main()
