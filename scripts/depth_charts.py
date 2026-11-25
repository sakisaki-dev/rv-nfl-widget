#!/usr/bin/env python3
"""work/depth_charts.json: per club, per depth-chart slot, up to three player keys from the latest daily snapshot
(a copy of the NFL edition's scripts/nfl/depth_charts.py). The widget uses the starters (injury report, sprites)."""
import csv
import gzip

from common import CACHE, SEASON, WORK, players, write_json

ABBR = {"LA": "LAR", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SD": "LAC", "STL": "LAR", "OAK": "LV", "JAC": "JAX"}
OFF = ["QB", "RB", "WR", "TE", "LT", "LG", "C", "RG", "RT"]
DEF = {
    "Base 3-4 D": ("3-4", ["LDE", "NT", "RDE", "WLB", "LILB", "RILB", "SLB", "LCB", "RCB", "SS", "FS"]),
    "Base 4-3 D": ("4-3", ["LDE", "LDT", "RDT", "RDE", "WLB", "MLB", "SLB", "LCB", "RCB", "SS", "FS"]),
}
DEPTH = 3


def main():
    gsis = {p["gsis"]: k for k, p in players().items() if p.get("gsis")}
    src = CACHE / f"depth_charts_{SEASON}.csv.gz"
    rows = list(csv.DictReader(gzip.open(src, "rt"))) if src.exists() else []
    at = max((r["dt"] for r in rows), default="")
    rows = [r for r in rows if r["dt"] == at]
    clubs: dict[str, dict] = {}
    for r in rows:
        t = ABBR.get(r["team"], r["team"])
        c = clubs.setdefault(t, {"off": {}, "def": {}})
        key = gsis.get(r["gsis_id"])
        if not key:
            continue
        rank = int(r["pos_rank"])
        if r["pos_grp"] == "3WR 1TE" and r["pos_abb"] in OFF:
            c["off"].setdefault(r["pos_abb"], {})[rank] = key
        elif r["pos_grp"] in DEF and r["pos_abb"] in DEF[r["pos_grp"]][1]:
            c["def"].setdefault(r["pos_grp"], {}).setdefault(r["pos_abb"], {})[rank] = key
    out = {}
    for t, c in sorted(clubs.items()):
        best = None
        for grp, (name, slots) in DEF.items():
            d = c["def"].get(grp, {})
            full = sum(1 for s in slots if d.get(s))
            tot = sum(len(v) for v in d.values())
            if best is None or (full, tot) > best[0]:
                best = ((full, tot), name, grp, slots)
        _, name, grp, slots = best
        d = c["def"].get(grp, {})
        o = {s: [v for _, v in sorted(c["off"].get(s, {}).items())][: (8 if s == "WR" else DEPTH)] for s in OFF}
        out[t] = {"base": name, "o": o, "d": {s: [v for _, v in sorted(d.get(s, {}).items())][:DEPTH] for s in slots}}
    write_json(WORK / "depth_charts.json", {"season": SEASON, "at": at[:10], "clubs": out})
    print(f"depth charts: {len(out)} clubs, snapshot {at or 'none'}")


if __name__ == "__main__":
    main()
