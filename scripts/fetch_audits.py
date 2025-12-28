#!/usr/bin/env python3
import subprocess
import sys
import time
import urllib.request
from shutil import copy2
from pathlib import Path

AUDIT_SHEETS = {
    "adac": ("1AIagKHZ0YtvW4i-TZJGYq_xl7b6oeb5aVlz4a-OJI00", "0"),
    "sglg": ("13e-AtBFytuQ9eXg_UoD8u6mAPyPIsrFO16pgutu-0dg", "0"),
    "poc": ("1yMv3IcJXOt6HGj0l8R6cjKPtqjhkP_zFRgZSwykCw1A", "0"),
    "lcpc": ("1r-wuL3wo46aDA53I4IurVLCAvwQdNjgpjTCazSaKJBQ", "0"),
    "cflga": ("12uG3QO0c8e9O3buPLxPzvFixK1iiqr-LHJ08VCj1O4w", "0"),
}


def download(name: str, sheet_id: str, gid: str):
    cache_bust = int(time.time() * 1000)
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&gid={gid}&cachebust={cache_bust}"
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
    # Keep Vite dev server assets in sync (public/ served at / in dev)
    root = Path(__file__).resolve().parents[1]
    output = root / "lg-audits.json"
    public_target = root / "public" / "lg-audits.json"
    if output.exists() and public_target.parent.exists():
        copy2(output, public_target)
        print(f"Synced {public_target}")


if __name__ == "__main__":
    main()
