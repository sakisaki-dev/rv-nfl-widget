"""Shared paths and the player table for the daily widget build (runs on GitHub Actions; no site code needed).

    cache/   the nflverse files of the season in progress (scripts/fetch.py; git-ignored)
    work/    intermediate files: injuries, depth charts, SZN, playoff odds (git-ignored)
    inputs/  the slow-changing inputs, refreshed by hand from the Retro Vault NFL edition
             (scripts/nfl/widget_publish.sh --inputs in that repo): players.json (key, gsis id, pfr id, club at the
             last refresh), espn_ids.json (key -> ESPN athlete id), art.json (the widget-art paths)
"""
from __future__ import annotations

import csv
import json
import os
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
WORK = ROOT / "work"
INPUTS = ROOT / "inputs"
_today = date.today()
# the season in progress (nflverse names a season by the year it starts); RV_NFL_SEASON overrides
SEASON = int(os.environ.get("RV_NFL_SEASON") or (_today.year if _today.month >= 8 else _today.year - 1))

# nflverse / roster abbreviation -> club nickname (players.json `team`)
ABBR = {"BUF": "Bills", "MIA": "Dolphins", "NE": "Patriots", "NYJ": "Jets", "DEN": "Broncos", "KC": "Chiefs",
        "LAC": "Chargers", "SD": "Chargers", "LV": "Raiders", "OAK": "Raiders", "BAL": "Ravens", "CIN": "Bengals",
        "CLE": "Browns", "PIT": "Steelers", "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "JAC": "Jaguars",
        "TEN": "Titans", "DAL": "Cowboys", "NYG": "Giants", "PHI": "Eagles", "WAS": "Commanders", "ARI": "Cardinals",
        "LAR": "Rams", "LA": "Rams", "STL": "Rams", "SF": "49ers", "SEA": "Seahawks", "CHI": "Bears", "DET": "Lions",
        "GB": "Packers", "MIN": "Vikings", "ATL": "Falcons", "CAR": "Panthers", "NO": "Saints", "TB": "Buccaneers"}


def load_json(p):
    return json.loads(Path(p).read_text())


def write_json(p, data):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


_players = None


def players() -> dict[str, dict]:
    """{key: {key, pos, n, gsis, pfr, team}} with `team` brought up to date by the NFL edition's rule
    (scripts/nfl/build_players.py): his club is the latest week of the season's roster that lists him on a club
    (CUT / RET rows drop off), and nobody on a roster in the last two roster weeks is a free agent. A player the
    season's roster never lists keeps the club of the last refresh (a retired player keeps his last club)."""
    global _players
    if _players is not None:
        return _players
    d = load_json(INPUTS / "players.json")
    out = {}
    for row in d["rows"]:
        p = dict(zip(d["cols"], row))
        p["pos"], p["n"] = p["key"].split(":", 1)
        out[p["key"]] = p
    f = CACHE / f"roster_{SEASON}.csv"
    if f.exists():
        by_gsis = {p["gsis"]: p for p in out.values() if p.get("gsis")}
        now, seen = {}, set()
        for r in csv.DictReader(open(f, newline="")):
            g = r["gsis_id"]
            if g not in by_gsis:
                continue
            seen.add(g)
            if r["status"] in ("CUT", "RET", ""):
                continue
            w = int(r["week"] or 0)
            if w >= now.get(g, (-1, ""))[0]:
                now[g] = (w, ABBR.get(r["team"], r["team"]))
        latest = max((v[0] for v in now.values()), default=0)
        for g, p in by_gsis.items():
            cur = now.get(g)
            if cur and cur[0] >= latest - 1:
                p["team"] = cur[1]
            elif g in seen:
                p["team"] = "FA"
    _players = out
    return out
