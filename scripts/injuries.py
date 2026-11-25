#!/usr/bin/env python3
"""work/injuries.json: per player key `POS:Name`, [code, part] (a copy of the NFL edition's scripts/nfl/injuries.py).

  IR   roster_<season>.csv status RES (reserve / injured)
  Out / Doubtful / Questionable   the latest week's official report_status, with the report's primary injury (and the
       secondary after a slash) as `part`
IR beats a report line. Deterministic. A season with no report yet gives an empty list.
"""
import csv

from common import CACHE, SEASON, WORK, players, write_json

CODE = {"Out": "Out", "Doubtful": "Doubtful", "Questionable": "Questionable"}


def main():
    gsis = {p["gsis"]: k for k, p in players().items() if p.get("gsis")}
    out, week = {}, 0
    f = CACHE / f"injuries_{SEASON}.csv"
    if f.exists():
        rep = list(csv.DictReader(open(f, newline="")))
        week = max((int(r["week"]) for r in rep), default=0)
        for r in rep:
            if int(r["week"]) != week or r["report_status"] not in CODE or r["gsis_id"] not in gsis:
                continue
            part = " / ".join(x.strip().lower() for x in (r["report_primary_injury"], r["report_secondary_injury"]) if x.strip())
            out[gsis[r["gsis_id"]]] = [CODE[r["report_status"]], part]
    f = CACHE / f"roster_{SEASON}.csv"
    if f.exists():
        for r in csv.DictReader(open(f, newline="")):
            if r["status"] == "RES" and r["gsis_id"] in gsis:
                out[gsis[r["gsis_id"]]] = ["IR", out.get(gsis[r["gsis_id"]], ["", ""])[1]]
    write_json(WORK / "injuries.json", {"season": SEASON, "week": week, "p": dict(sorted(out.items()))})
    print(f"injuries: {len(out)} players, week {week}")


if __name__ == "__main__":
    main()
