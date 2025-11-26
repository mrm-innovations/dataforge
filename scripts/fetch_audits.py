#!/usr/bin/env python3
import subprocess
import sys
import urllib.request
from pathlib import Path

AUDIT_SHEETS = {
    "adac": ("1AIagKHZ0YtvW4i-TZJGYq_xl7b6oeb5aVlz4a-OJI00", "0"),
    "sglg": ("13e-AtBFytuQ9eXg_UoD8u6mAPyPIsrFO16pgutu-0dg", "0"),
    "poc": ("1yMv3IcJXOt6HGj0l8R6cjKPtqjhkP_zFRgZSwykCw1A", "0"),
    "lcpc": ("1r-wuL3wo46aDA53I4IurVLCAvwQdNjgpjTCazSaKJBQ", "0"),
}


def download(name: str, sheet_id: str, gid: str):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}"
    data = urllib.request.urlopen(url).read()
    path = Path("datasets") / f"{name}.csv"
    path.write_bytes(data)
    print(f"Saved {path}")


def main():
    for name, (sheet_id, gid) in AUDIT_SHEETS.items():
        download(name, sheet_id, gid)
    result = subprocess.run([sys.executable, "scripts/build_lg_audits_json.py"], check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
