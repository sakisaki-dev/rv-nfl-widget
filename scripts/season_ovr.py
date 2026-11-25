#!/usr/bin/env python3
"""work/season_ovr.json: SZN, every player's rating for the season in progress (the NFL edition's scripts/season_ovr.py
`rate_season(NOW)`, the same rule on the same nflverse files, without the site's game-log folder).

A season line is the sum of his regular-season game lines (stats_player_week), plus a game with snaps and no stat line
(snap_counts) so games stay true for a quiet day or an offensive lineman.
  production  the League Score formula on the line at a 17-game pace; efficiency: QB + 1.0 per game of passing EPA,
              RB / WR / TE + 0.6 per game of rushing + receiving EPA
  playing time  effective games = games x min(1, snap share / 0.6) (snap share: the mean offensive or defensive share)
  small samples  adj = prior + (pace - prior) x min(1, effective games / 10), prior = the position's 5th percentile
  rating      round(62 + 37 x pct ** 2.3), pct = rank within the position; OL get none (no blocking stats)
Only the players in inputs/players.json are rated, as on the site.
"""
from __future__ import annotations

import csv
import gzip
from collections import defaultdict

from common import CACHE, SEASON, WORK, players, write_json

SHRINK_GAMES = 10
PACE = 17
OFF = ("QB", "RB", "WR", "TE", "OL")
UNRATED = ("OL",)
FIELD_MAP = {
    "QB": {"g": "games", "att": "attempts", "cmp": "completions", "yds": "passYds", "td": "passTD", "int": "interceptions", "sck": "sacks", "ratt": "rushAtt", "ryds": "rushYds", "rtd": "rushTD"},
    "RB": {"g": "games", "ratt": "rushAtt", "ryds": "rushYds", "rtd": "rushTD", "fum": "fumbles", "rec": "receptions", "recyds": "recYds", "rectd": "recTD"},
    "REC": {"g": "games", "rec": "receptions", "yds": "recYds", "td": "recTD", "fum": "fumbles", "lng": "longest"},
    "OL": {"g": "games", "blk": "blocks"},
    "DEF": {"g": "games", "tkl": "tackles", "int": "interceptions", "sck": "sacks", "ff": "forcedFumbles"},
}


def _group(pos):
    return "REC" if pos in ("WR", "TE") else "DEF" if pos in ("LB", "DB", "DL") else pos


def _n(v):
    try:
        return float(v) if v not in ("", None, "NA") else 0.0
    except ValueError:
        return 0.0


def line_of(pos, rows):
    t = lambda n: sum(_n(r.get(n)) for r in rows)  # noqa: E731
    g = len(rows)
    if pos == "QB":
        return {"g": g, "att": t("attempts"), "cmp": t("completions"), "yds": t("passing_yards"), "td": t("passing_tds"), "int": t("passing_interceptions"), "sck": t("sacks_suffered"), "ratt": t("carries"), "ryds": t("rushing_yards"), "rtd": t("rushing_tds")}
    if pos == "RB":
        return {"g": g, "ratt": t("carries"), "ryds": t("rushing_yards"), "rtd": t("rushing_tds"), "fum": t("fumbles_lost_total"), "rec": t("receptions"), "recyds": t("receiving_yards"), "rectd": t("receiving_tds")}
    if pos in ("WR", "TE"):
        return {"g": g, "rec": t("receptions"), "yds": t("receiving_yards"), "td": t("receiving_tds"), "fum": t("fumbles_lost_total")}
    if pos == "OL":
        return {"g": g}
    return {"g": g, "tkl": t("def_tackles_solo") + t("def_tackle_assists"), "int": t("def_interceptions"), "sck": t("def_sacks"), "ff": t("def_fumbles_forced")}


def production(pos, p):
    g = lambda k: p.get(k) or 0  # noqa: E731
    if pos == "QB":
        return g("yds") / 80 + 0.9 * g("td") + 0.9 * g("rtd") - 0.6 * g("int")
    if pos == "RB":
        return g("ryds") / 18 + 2.2 * g("rtd") + g("recyds") / 30 + 2.2 * g("rectd")
    if pos in ("WR", "TE"):
        return g("yds") / (14 if pos == "WR" else 8) + (2.5 if pos == "WR" else 3) * g("td")
    if pos == "OL":
        return 2 * g("g")
    return 0.7 * g("tkl") + 12 * g("int") + 14 * g("sck") + 14 * g("ff")


def efficiency(pos, rows):
    t = lambda n: sum(_n(r.get(n)) for r in rows)  # noqa: E731
    if pos == "QB":
        return 1.0 * t("passing_epa") / max(1, len(rows))
    if pos in ("RB", "WR", "TE"):
        return 0.6 * (t("rushing_epa") + t("receiving_epa")) / max(1, len(rows))
    return 0.0


def rate():
    P = players()
    gsis_key = {p["gsis"]: k for k, p in P.items() if p.get("gsis")}
    pfr_key = {p["pfr"]: k for k, p in P.items() if p.get("pfr")}
    logs = defaultdict(list)   # key -> REG game rows
    played = defaultdict(set)  # key -> game ids
    f = CACHE / f"stats_player_week_{SEASON}.csv.gz"
    if f.exists():
        for r in csv.DictReader(gzip.open(f, "rt")):
            k = gsis_key.get(r["player_id"])
            if not k:
                continue
            played[k].add(r["game_id"])
            if r["season_type"] == "REG":
                logs[k].append(r)
    snap = defaultdict(list)
    f = CACHE / f"snap_counts_{SEASON}.csv.gz"
    if f.exists():
        for r in csv.DictReader(gzip.open(f, "rt")):
            k = pfr_key.get(r["pfr_player_id"])
            if not k:
                continue
            if _n(r["offense_snaps"]) + _n(r["defense_snaps"]) + _n(r["st_snaps"]) > 0 and r["game_id"] not in played[k]:
                played[k].add(r["game_id"])
                if r["game_type"] == "REG":
                    logs[k].append({})  # a game with snaps and no stat line
            if r["game_type"] != "REG":
                continue
            pct = _n(r["offense_pct"]) if k.split(":")[0] in OFF else _n(r["defense_pct"])
            if pct > 0:
                snap[k].append(pct)
    share = {k: sum(v) / len(v) for k, v in snap.items()}
    rows = []
    for k, gs in logs.items():
        pos = k.split(":")[0]
        line = line_of(pos, gs)
        n = len(gs)
        pace = (production(pos, line) + efficiency(pos, gs) * n) / n * PACE
        eff = n * min(1.0, share.get(k, 0.0) / 0.6)
        rows.append((k, pos, line, pace, eff))
    out = {}
    by = defaultdict(list)
    for r in rows:
        if r[1] not in UNRATED:
            by[r[1]].append(r)
    for pos, lst in by.items():
        paces = sorted(r[3] for r in lst)
        prior = paces[int(0.05 * (len(paces) - 1))]
        adj = {r[0]: prior + (r[3] - prior) * min(1.0, r[4] / SHRINK_GAMES) for r in lst}
        order = sorted(adj, key=lambda k: (adj[k], k))
        n = len(order)
        for i, k in enumerate(order):
            pct = i / (n - 1) if n > 1 else 1
            out[k] = round(62 + 37 * pct ** 2.3)
    return out, {r[0]: r[2] for r in rows}


def main():
    ovr, lines = rate()
    skill = {}
    for k, line in lines.items():
        m = FIELD_MAP[_group(k.split(":")[0])]
        skill[k] = {m[f]: v for f, v in line.items() if f in m}
    write_json(WORK / "season_ovr.json", {"season": SEASON, "live": True, "shrinkGames": SHRINK_GAMES, "ovr": dict(sorted(ovr.items())),
                                          "linesFrom": "games", "lines": dict(sorted(skill.items()))})
    print(f"season_ovr: {SEASON}, {len(ovr)} players rated, {sum(1 for v in ovr.values() if v >= 90)} at 90+")


if __name__ == "__main__":
    main()
