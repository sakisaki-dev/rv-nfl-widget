#!/usr/bin/env python3
"""The iPhone widget's data feed, widget.json at the repo root: a copy of the Retro Vault NFL edition's
scripts/nfl/widget_data.py that runs on GitHub Actions. The rules are the same; what differs:
  * inputs come from work/ (this repo's daily steps) and inputs/ (refreshed by hand from the NFL edition)
  * sprites are never drawn here: a player gets the sprite files already in widget-sprites/ (named as the NFL
    edition's scripts/widget_sprites.py names them); one with no file yet has none, and the widget draws its layout
    without him (logo or number), as it always has. The art paths come from inputs/art.json (widget-art/ as published).

    python3 scripts/widget_data.py                 # follows the Vikings (RV_NFL_CLUB=MIN, an nflverse abbreviation)

Read by rv-nfl-widget.js (Scriptable). Everything is a rule over files the daily steps wrote (work/), no network
and no AI:
  club        record and division place (work/playoff_odds.json clubs), conference, power rank (the model's
              point-differential rating among the 32)
  schedule    every regular-season game of the newest season from nflverse games.csv.gz: kickoff (UTC, converted from
              the Eastern time nflverse lists), the ESPN event id (for site.api.espn.com summary?event=ID), the score
              once played, the posted line from the club's side
  next        the next unplayed game with its win chance: playoff_odds.json picks (Phi(line / 13.45), see that
              file's `method`), the only weeks the model prices are the current one's
  odds        playoffs, division, bye, Super Bowl chances, expected wins, the CLINCHED / ELIMINATED tag and the clinch
              scenarios that name the club
  mvp         the SZN race: the three best season ratings (work/season_ovr.json) among QB / RB / WR / TE
              who have played at least half the games of the most-played player
  best        the club's best player this season by SZN, the injury report for the club's depth-chart starters
  players     every player the widget may draw: key, last name, position, club, SZN, ESPN athlete id (so ESPN's live
              leaders map to a sprite) and the pre-scaled sprites (figure, mirrored, celebrating, white silhouette)
Sprites (widget-sprites/) and art (widget-art/) are published from the NFL edition: scripts/nfl/widget_publish.sh
(nearest-neighbour 6x, one anchor: centre line 31.5, feet row 58 of 64).
Missing stats are skipped, never zero. Deterministic: two runs give identical bytes.
"""
from __future__ import annotations

import csv
import gzip
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from common import CACHE, INPUTS, ROOT, WORK, players as load_players

OUT = ROOT / "widget.json"
SPRITES = ROOT / "widget-sprites"
SPRITE_URL = "data/nfl/widget-sprites/"  # the widget names files by their site path; it strips data/nfl/ for this repo
CLUB = os.environ.get("RV_NFL_CLUB", "MIN")
SIGMA = 13.45
SPRITE_SCALE = 6  # file pixels per game pixel: 6 divides into 3 device pixels exactly on a 3x phone (2 and 3 per game pixel stay crisp)

# nflverse abbreviation -> (nickname, ESPN abbreviation, primary, secondary): the official colours the site and the
# Retro Vault widget use (Raiders / Cowboys silver, Panthers black ...)
CLUBS = {
    "ARI": ("Cardinals", "ARI", "#97233F", "#000000"), "ATL": ("Falcons", "ATL", "#A71930", "#000000"),
    "BAL": ("Ravens", "BAL", "#241773", "#9E7C0C"), "BUF": ("Bills", "BUF", "#00338D", "#C60C30"),
    "CAR": ("Panthers", "CAR", "#101820", "#0085CA"), "CHI": ("Bears", "CHI", "#0B162A", "#C83803"),
    "CIN": ("Bengals", "CIN", "#FB4F14", "#111111"), "CLE": ("Browns", "CLE", "#311D00", "#FF3C00"),
    "DAL": ("Cowboys", "DAL", "#869397", "#003594"), "DEN": ("Broncos", "DEN", "#FB4F14", "#002244"),
    "DET": ("Lions", "DET", "#0076B6", "#B0B7BC"), "GB": ("Packers", "GB", "#203731", "#FFB612"),
    "HOU": ("Texans", "HOU", "#03202F", "#A71930"), "IND": ("Colts", "IND", "#002C5F", "#A2AAAD"),
    "JAX": ("Jaguars", "JAX", "#006778", "#D7A22A"), "KC": ("Chiefs", "KC", "#E31837", "#FFB81C"),
    "LAC": ("Chargers", "LAC", "#0080C6", "#FFC20E"), "LAR": ("Rams", "LAR", "#FFD100", "#003594"),
    "LV": ("Raiders", "LV", "#A5ACAF", "#000000"), "MIA": ("Dolphins", "MIA", "#008E97", "#FC4C02"),
    "MIN": ("Vikings", "MIN", "#4F2683", "#FFC62F"), "NE": ("Patriots", "NE", "#002244", "#C60C30"),
    "NO": ("Saints", "NO", "#D3BC8D", "#101820"), "NYG": ("Giants", "NYG", "#0B2265", "#A71930"),
    "NYJ": ("Jets", "NYJ", "#125740", "#FFFFFF"), "PHI": ("Eagles", "PHI", "#004C54", "#A5ACAF"),
    "PIT": ("Steelers", "PIT", "#FFB612", "#101820"), "SEA": ("Seahawks", "SEA", "#4C8C2B", "#002244"),
    "SF": ("49ers", "SF", "#AA0000", "#B3995D"), "TB": ("Buccaneers", "TB", "#D50A0A", "#34302B"),
    "TEN": ("Titans", "TEN", "#4B92DB", "#0C2340"), "WAS": ("Commanders", "WSH", "#5A1414", "#FFB612"),
}
NICK_TO_ABBR = {v[0]: k for k, v in CLUBS.items()}
DIVISIONS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"], "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAX", "TEN"], "AFC West": ["DEN", "KC", "LAC", "LV"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"], "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"], "NFC West": ["ARI", "LAR", "SEA", "SF"],
}
ORD = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th"}
SKILL = ("QB", "RB", "WR", "TE")


def load_json(p):
    return json.loads(Path(p).read_text())


def kickoff_utc(day: str, time: str) -> str | None:
    if not day or not time:
        return None
    local = datetime.strptime(f"{day} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("America/New_York"))
    return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def sprite_name(key: str, club: str, action: str = "idle", variant: str = "") -> str:
    """The file name scripts/widget_sprites.py (SpriteSet.want) gives a sprite."""
    return "-".join(x for x in (slug(key.replace(":", " ")), slug(club), "cheer" if action == "celebrate" else "", variant) if x) + ".png"


def schedule(season: int, club: str) -> list[dict]:
    rows = list(csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")))
    out = []
    for r in rows:
        if r["season"] != str(season) or r["game_type"] != "REG" or club not in (r["home_team"], r["away_team"]):
            continue
        home = r["home_team"] == club
        opp = r["away_team"] if home else r["home_team"]
        ps, pa = num(r["home_score"] if home else r["away_score"]), num(r["away_score"] if home else r["home_score"])
        played = ps is not None and pa is not None
        line = num(r["spread_line"])  # the home side's expected margin
        g = {"week": int(r["week"]), "date": r["gameday"], "time": r["gametime"], "kickoff": kickoff_utc(r["gameday"], r["gametime"]),
             "opp": opp, "home": home, "espn": r["espn"] or None, "roof": r["roof"] or None}
        if played:
            g.update({"played": True, "for": int(ps), "against": int(pa), "result": "W" if ps > pa else "L" if ps < pa else "T"})
        else:
            g["played"] = False
        if line is not None:
            g["line"] = line if home else -line  # from the club's side: positive = favoured
        out.append(g)
    out.sort(key=lambda g: g["week"])
    return out


def main():
    po = load_json(WORK / "playoff_odds.json")
    season = po["season"]
    clubs = po["clubs"]
    me = clubs[CLUB]
    nick = CLUBS[CLUB][0]
    division = next(d for d, ts in DIVISIONS.items() if CLUB in ts)
    mates = sorted(DIVISIONS[division], key=lambda t: (-(clubs[t]["w"] + clubs[t]["t"] / 2) / max(1, clubs[t]["w"] + clubs[t]["l"] + clubs[t]["t"]), -clubs[t]["rating"]))
    place = mates.index(CLUB) + 1
    by_rating = sorted(clubs, key=lambda t: -clubs[t]["rating"])

    sched = schedule(season, CLUB)
    nxt = next((g for g in sched if not g["played"]), None)
    last = next((g for g in reversed(sched) if g["played"]), None)
    pick = None
    if nxt:
        gid = f"{season}_{nxt['week']:02d}_" + (f"{nxt['opp']}_{CLUB}" if not nxt["home"] else f"{CLUB}_{nxt['opp']}")
        pk = next((p for p in po["picks"]["games"] if p["id"] == gid or {p["home"], p["away"]} == {CLUB, nxt["opp"]} and p["week"] == nxt["week"]), None)
        if pk:
            p_home = pk["pHome"]
            pick = {"win": round(p_home if nxt["home"] else 1 - p_home, 3), "basis": pk["basis"]}
        oc = clubs[nxt["opp"]]
        pick = {**(pick or {}), "oppRec": f"{oc['w']}-{oc['l']}" + (f"-{oc['t']}" if oc["t"] else "")}
    scen = [s["text"] for s in po.get("scenarios", []) if s.get("club") == CLUB][:2]

    # --- players -------------------------------------------------------------------------------------------
    players = load_players()
    szn = load_json(WORK / "season_ovr.json")
    lines = szn["lines"]
    max_g = max((l.get("games", 0) for l in lines.values()), default=0)
    inj = load_json(WORK / "injuries.json")["p"]
    espn = {v: k for k, v in load_json(INPUTS / "espn_ids.json").items()}
    depth = load_json(WORK / "depth_charts.json")["clubs"]

    def club_of(key):
        t = players.get(key, {}).get("team")
        return NICK_TO_ABBR.get(t)

    def last_name(key):
        n = key.split(":", 1)[1]
        parts = n.replace(" Jr.", "").replace(" Sr.", "").replace(" II", "").replace(" III", "").split()
        if len(parts) >= 2 and parts[-2] in ("Van", "Von", "De", "Di", "La", "Le", "St.", "Du", "Da", "Mc", "Del"):
            return f"{parts[-2]} {parts[-1]}"
        return parts[-1] if parts else n

    def entry(key):
        return {"key": key, "last": last_name(key), "pos": key.split(":")[0], "team": club_of(key), "szn": szn["ovr"].get(key),
                "games": lines.get(key, {}).get("games")}

    active = [k for k in szn["ovr"] if lines.get(k, {}).get("games", 0) > 0 and club_of(k)]
    mvp_pool = [k for k in active if k.split(":")[0] in SKILL and lines[k]["games"] >= max(1, max_g // 2)]
    mvp_keys = sorted(mvp_pool, key=lambda k: (-szn["ovr"][k], k))[:3]
    mine = [k for k in active if club_of(k) == CLUB and lines[k]["games"] >= max(1, (me["w"] + me["l"] + me["t"]) // 2)]
    mine.sort(key=lambda k: (-szn["ovr"][k], k))
    best_key = mine[0] if mine else None

    starters = []
    for grp in ("o", "d"):
        for slot, ks in depth[CLUB].get(grp, {}).items():
            if ks:
                starters.append(ks[0])
    injuries = []
    for k in starters:
        if k in inj:
            injuries.append({**entry(k), "status": inj[k][0], "part": inj[k][1]})
    injuries.sort(key=lambda x: (-(x["szn"] or 0), x["key"]))

    # who gets sprites: the club's key players, every club's top three skill players by SZN, the MVP race
    want: dict[str, set] = {}  # key -> variants {"", "left", "cheer", "sil"}

    def add(key, *variants):
        want.setdefault(key, set()).update(variants or {""})

    club_keys = [k for k in mine if k.split(":")[0] in SKILL][:8] + [k for k in mine if k.split(":")[0] not in SKILL][:6]
    for k in club_keys:
        add(k, "", "left")
    if best_key:
        add(best_key, "", "left", "cheer", "sil")
    for k in mvp_keys:
        add(k, "", "sil")
    top3: dict[str, list] = {}
    for t in CLUBS:
        ks = sorted((k for k in active if club_of(k) == t and k.split(":")[0] in SKILL and lines[k]["games"] >= 3),
                    key=lambda k: (-szn["ovr"][k], k))
        qb = next((k for k in ks if k.startswith("QB:")), None)
        rest = [k for k in ks if k != qb][:2]
        top3[t] = ([qb] if qb else []) + rest
        for k in top3[t]:
            add(k, "", "left")
    for k in [x for x in starters if x.split(":")[0] in SKILL]:
        add(k, "", "left")
    if (depth.get(CLUB, {}).get("o", {}).get("QB") or [None])[0]:
        add(depth[CLUB]["o"]["QB"][0], "", "left", "cheer", "sil")

    # sprites: the files already published (drawn by the NFL edition, scripts/widget_sprites.py); none = no sprite
    sprites: dict[str, dict] = {}
    for key in sorted(want):
        t = club_of(key)
        if not t:
            continue
        club = CLUBS[t][0]
        u = {}
        for v in sorted(want[key]):
            kind, action, variant = ("cheer", "celebrate", "") if v == "cheer" else ("fig", "idle", "") if v == "" else (v, "idle", v)
            name = sprite_name(key, club, action, variant)
            if (SPRITES / name).exists():
                u[kind] = SPRITE_URL + name
        sprites[key] = u

    pl = {}
    for key in sorted(want):
        e = entry(key)
        e["espn"] = espn.get(key)
        e["sprites"] = sprites.get(key, {})
        pl[key] = e

    # the playoff chance before the last played game, for the final view's "odds change": the previous run's number,
    # kept until the next played game (the file only changes when a game does)
    prev = None
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text())
            if old.get("club", {}).get("abbr") == CLUB and old.get("season") == season:
                same = (old["club"]["w"], old["club"]["l"], old["club"]["t"]) == (me["w"], me["l"], me["t"])
                prev = old["odds"].get("prev") if same else old["odds"].get("playoffs")
        except Exception:  # noqa: BLE001
            prev = None
    data = {
        "_about": "NFL edition: the iPhone widget's feed. Built daily on GitHub Actions by scripts/widget_data.py (github.com/sakisaki-dev/rv-nfl-widget); read by rv-nfl-widget.js.",
        "season": season, "week": po["week"], "status": po["status"], "weeksTotal": po["weeksTotal"],
        "club": {"abbr": CLUB, "name": nick, "espnAbbr": CLUBS[CLUB][1], "primary": CLUBS[CLUB][2], "secondary": CLUBS[CLUB][3],
                 "division": division, "conf": me["conf"], "place": ORD[place], "w": me["w"], "l": me["l"], "t": me["t"],
                 "diff": me["diff"], "left": me["left"], "power": by_rating.index(CLUB) + 1},
        "schedule": sched,
        "slate": [{"away": p["away"], "home": p["home"], "kickoff": kickoff_utc(p["date"], p["time"]), "gotw": p["gotw"]} for p in po["picks"]["games"]],
        "next": ({**nxt, **(pick or {})} if nxt else None),
        "last": last,
        "odds": {"prev": prev, "playoffs": me["playoffs"], "divWin": me["divWin"], "bye": me["bye"], "superBowl": me["superBowl"],
                 "expWins": me["expWins"], "tag": me["tag"], "seeds": me.get("seeds"), "scenarios": scen},
        "mvp": [entry(k) for k in mvp_keys],
        "best": entry(best_key) if best_key else None,
        "injuries": injuries[:4],
        "top": {t: top3[t] for t in sorted(top3)},
        "players": pl,
        "sigma": SIGMA,
        "art": load_json(INPUTS / "art.json"),
    }
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
    used = {u for e in pl.values() for u in e["sprites"].values()}
    n, size = len(used), sum((SPRITES / u.rsplit("/", 1)[1]).stat().st_size for u in used)
    print(f"widget_data: {CLUB} {data['club']['w']}-{data['club']['l']} week {po['week']}, {len(sched)} games, next "
          f"{(nxt or {}).get('opp')} {(pick or {}).get('win')}, {len(pl)} players, {n} sprites named ({size // 1024} KB) -> "
          f"{OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
