#!/usr/bin/env python3
"""A copy of the Retro Vault NFL edition's scripts/nfl/playoff_odds.py (reads cache/games.csv.gz, writes
work/playoff_odds.json; the model is unchanged). NFL edition: playoff odds, clinch scenarios and next week's picks for the season in progress.

    python3 scripts/playoff_odds.py                           # newest season -> work/playoff_odds.json
    python3 scripts/playoff_odds.py --season 2025 --cut-week 14 --out /tmp/x.json   # a backtest: pretend only
                                                              # weeks 1-14 of 2025 are played (scores after are ignored)

Source: cache/games.csv.gz (nflverse), regular-season games only. Deterministic: the simulation is seeded by
season and week, so two runs give byte-identical output.

THE MODEL
* Win chance of a game: when the game has a posted line (nflverse `spread_line`, the home side's expected margin),
  p(home) = Phi(line / 13.45), the usual NFL conversion (a game's margin is about normal with a standard deviation of
  13.45 points). Otherwise the clubs' ratings: a club's rating is its point differential per game this season, shrunk
  toward 0 by games / (games + SHRINK) (a small sample is mostly noise), and the expected home margin is
  rating(home) - rating(away) + HFA. SHRINK and HFA were fitted to the posted lines of the games already played this
  season (least squares, see `calibrate`), HFA to the NFL's long-run home edge.
* The remaining regular-season games are played SIMS (10,000) times from those chances (no ties are simulated; ties
  already in the standings count half a win). Each run seeds the playoffs and plays them out: 7 clubs a conference,
  the four division winners seeded 1-4 by record, then the three best other records, the bye only for the 1 seed;
  round 1 is 2v7, 3v6, 4v5, then the best remaining seed hosts the worst, then the conference title, then the Super
  Bowl at a neutral site (no home edge). Playoff games use the rating model plus HFA (no lines are posted that far
  ahead). Output per club: playoffs, division, bye (the 1 seed), conference title and Super Bowl chances.
* TIEBREAKERS (the NFL's order, applied to every tie on record, division and wild card alike): division ties go
  head-to-head, division record, common games (at least 4), conference record, strength of victory, strength of
  schedule; wild-card and seeding ties go head-to-head (a sweep when three or more are tied), conference record,
  common games (at least 4), strength of victory, strength of schedule. When a step splits the tied clubs the
  tiebreak restarts for each smaller group; a club's division mates are first reduced to the best one before the
  conference steps, as the league does. NOT implemented: the point-based steps (points ranks, net points) and the
  coin toss: when every step above ties, the order is a random draw from the same seeded generator.
* CLINCHED / ELIMINATED marks are never taken from the simulation alone. They come from a bound check on the standings
  (`bounds`): clinched a spot (x) when fewer than three clubs outside the winners could still finish at or above the
  club's current wins (ties counted against it), the division (y) when no division mate can reach its current wins, the
  bye (z) when no club in the conference can; eliminated (e) when the club's best finish (win out) is strictly below
  three non-winners and a division rival. Anything the bound cannot prove stays a percentage, even at 0 or 100 in the
  simulation (the panel then reads "<1%" or ">99%"). The build checks the marks against the simulation.
* CLINCH SCENARIOS for the coming week: for each club and each kind of clinch or elimination, every result of the
  week's games that matter is tried against the same bound check (on the standings after that week); the shortest
  one-, two- and three-result combinations that settle it whatever else happens are kept ("Eagles clinch the NFC East
  with a win, or a Cowboys loss"). A club with nothing to settle this week gets no line; the bound check is
  deliberately conservative, so early in the season there are few.
* PICKS: each game of the coming week with its favourite and win chance (the model above, so the posted line when
  there is one), the Game of the Week (the closest game, within 12 points of a coin flip, between two clubs above
  .500, the best combined record on a tie), and the scorecard (favourites' record, the upset of the week, the
  season). Played games are scored on the line they had, else the rating model as it stood before that week; a game
  within 3 points of a coin flip is a toss-up and is not scored.
"""
import argparse
import csv
import gzip
import itertools
import json
import math
import random
import zlib
from pathlib import Path

from common import CACHE, ROOT, WORK  # noqa: E402
SIMS = 10000
SIGMA = 13.45
HFA = 1.5
SHRINK = 12.0
TOSSUP = 0.03  # |p - 0.5| under this is a toss-up
ALIAS = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS", "JAC": "JAX"}
DIVISIONS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"], "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAX", "TEN"], "AFC West": ["DEN", "KC", "LAC", "LV"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"], "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"], "NFC West": ["ARI", "LAR", "SEA", "SF"],
}
NAMES = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers", "CHI": "Bears",
    "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
    "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs", "LAC": "Chargers", "LAR": "Rams",
    "LV": "Raiders", "MIA": "Dolphins", "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
    "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers",
    "TEN": "Titans", "WAS": "Commanders",
}
TEAMS = sorted(NAMES)
TI = {t: i for i, t in enumerate(TEAMS)}
DIV_OF = {TI[t]: d for d, ts in DIVISIONS.items() for t in ts}
CONF_OF = {i: d[:3] for i, d in DIV_OF.items()}
CONFS = ("AFC", "NFC")
DIV_NAMES = sorted(DIVISIONS)


def phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def fnum(s):
    return float(s) if s not in ("", None) else None


def load_games(season, cut_week):
    out = []
    for r in csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")):
        if int(r["season"]) != season or r["game_type"] != "REG":
            continue
        a, h = (ALIAS.get(r[k], r[k]) for k in ("away_team", "home_team"))
        wk = int(r["week"])
        played = r["home_score"] != "" and (cut_week is None or wk <= cut_week)
        out.append({
            "id": r["game_id"], "week": wk, "away": TI[a], "home": TI[h],
            "as": int(float(r["away_score"])) if played else None, "hs": int(float(r["home_score"])) if played else None,
            "line": fnum(r["spread_line"]), "date": r["gameday"], "time": r["gametime"], "day": r["weekday"][:3],
        })
    out.sort(key=lambda g: (g["week"], g["date"], g["time"], g["home"]))
    return out


def ratings(games, upto_week=None):
    """Point differential per game, shrunk by sample size. upto_week: only weeks before it."""
    pd, n = [0.0] * 32, [0] * 32
    for g in games:
        if g["hs"] is None or (upto_week is not None and g["week"] >= upto_week):
            continue
        m = g["hs"] - g["as"]
        pd[g["home"]] += m
        pd[g["away"]] -= m
        n[g["home"]] += 1
        n[g["away"]] += 1
    return [(pd[i] / n[i]) * n[i] / (n[i] + SHRINK) if n[i] else 0.0 for i in range(32)]


def calibrate(games):
    """Least-squares fit of (SHRINK, HFA) to the posted lines of the games already played (reported, not used live:
    the constants above are the rounded fit). Ratings use all played games, so this checks scale, not prediction."""
    best = None
    played = [g for g in games if g["hs"] is not None and g["line"] is not None]
    if len(played) < 40:
        return None
    for k in (0, 2, 4, 6, 8, 12, 20):
        pd, n = [0.0] * 32, [0] * 32
        for g in games:
            if g["hs"] is None:
                continue
            m = g["hs"] - g["as"]
            pd[g["home"]] += m
            pd[g["away"]] -= m
            n[g["home"]] += 1
            n[g["away"]] += 1
        r = [(pd[i] / n[i]) * n[i] / (n[i] + k) if n[i] else 0.0 for i in range(32)]
        for hfa in (0.0, 1.0, 1.5, 2.0, 2.5):
            e = sum((g["line"] - (r[g["home"]] - r[g["away"]] + hfa)) ** 2 for g in played) / len(played)
            if best is None or e < best[0]:
                best = (e, k, hfa)
    return {"games": len(played), "rmse": round(math.sqrt(best[0]), 2), "shrink": best[1], "hfa": best[2]}


def p_home(g, rate):
    if g["line"] is not None:
        return phi(g["line"] / SIGMA), "line"
    return phi((rate[g["home"]] - rate[g["away"]] + HFA) / SIGMA), "rating"


# ---------------------------------------------------------------- standings and tiebreakers

class Season:
    """Records and tiebreakers over a list of results [(winner or None, team a, team b)] per team."""

    def __init__(self, games_of, wins, played, rng):
        self.g = games_of  # per team: list of (opp, result 1 / .5 / 0)
        self.w = wins
        self.n = played
        self.rng = rng

    def pct(self, t):
        return self.w[t] / self.n[t] if self.n[t] else 0.0

    def rec(self, t, opps):
        res = [r for o, r in self.g[t] if o in opps]
        return (sum(res) / len(res)) if res else None, len(res)

    # steps return {team: metric, higher is better} or None when the step does not apply
    def h2h(self, S):
        m = {}
        for t in S:
            res = [r for o, r in self.g[t] if o in S and o != t]
            if not res:
                return None
            m[t] = sum(res) / len(res)
        return m

    def sweep(self, S):
        if len(S) == 2:
            return self.h2h(S)
        m = {}
        for t in S:
            allv = True
            for o in S:
                if o == t:
                    continue
                res = [r for x, r in self.g[t] if x == o]
                if not res:
                    return None
                allv = allv and sum(res) / len(res) > 0.5 or False
            m[t] = allv
        winners = [t for t in S if m[t]]
        if len(winners) == 1:
            return {t: (1 if m[t] else 0) for t in S}
        losers = []
        for t in S:
            if all(sum(r for x, r in self.g[t] if x == o) / max(1, len([1 for x, r in self.g[t] if x == o])) < 0.5 for o in S if o != t):
                losers.append(t)
        if len(losers) == 1:
            return {t: (-1 if t in losers else 0) for t in S}
        return None

    def divrec(self, S):
        return {t: self.rec(t, {o for o in range(32) if DIV_OF[o] == DIV_OF[t] and o != t})[0] or 0 for t in S}

    def confrec(self, S):
        return {t: self.rec(t, {o for o in range(32) if CONF_OF[o] == CONF_OF[t] and o != t})[0] or 0 for t in S}

    def common(self, S):
        common = set.intersection(*[{o for o, _ in self.g[t]} for t in S]) - set(S)
        m = {}
        for t in S:
            res = [r for o, r in self.g[t] if o in common]
            if len(res) < 4:
                return None
            m[t] = sum(res) / len(res)
        return m

    def sov(self, S):
        m = {}
        for t in S:
            beat = [o for o, r in self.g[t] if r == 1]
            ow = sum(self.w[o] for o in beat)
            on = sum(self.n[o] for o in beat)
            m[t] = ow / on if on else 0
        return m

    def sos(self, S):
        m = {}
        for t in S:
            opp = [o for o, _ in self.g[t]]
            ow = sum(self.w[o] for o in opp)
            on = sum(self.n[o] for o in opp)
            m[t] = ow / on if on else 0
        return m

    def order(self, S, kind):
        """The tied clubs S, best first. kind: 'div' or 'wc'."""
        S = list(S)
        if len(S) == 1:
            return S
        steps = ([self.h2h, self.divrec, self.common, self.confrec, self.sov, self.sos] if kind == "div"
                 else [self.sweep, self.confrec, self.common, self.sov, self.sos])
        for step in steps:
            m = step(S)
            if m is None:
                continue
            vals = sorted({round(float(v), 9) for v in m.values()}, reverse=True)
            if len(vals) == 1:
                continue
            out = []
            for v in vals:
                out += self.order([t for t in S if round(float(m[t]), 9) == v], kind)
            return out
        self.rng.shuffle(S)  # every step ties: a draw (the NFL's coin toss comes after the point steps we skip)
        return S

    def ranked(self, teams, kind, key=None):
        """teams sorted by pct, ties broken."""
        out = []
        by = {}
        for t in teams:
            by.setdefault(round(self.pct(t), 9), []).append(t)
        for v in sorted(by, reverse=True):
            grp = by[v]
            out += self.order(grp, kind) if kind == "div" else self.wc_order(grp)
        return out

    def wc_order(self, grp):
        """Tied wild-card contenders: the division's best is the club that enters the conference steps."""
        rest = list(grp)
        out = []
        while rest:
            if len(rest) == 1:
                out += rest
                break
            reps = {}
            for t in self.div_pos_order(rest):
                reps.setdefault(DIV_OF[t], t)
            top = self.order(list(reps.values()), "wc")[0]
            out.append(top)
            rest.remove(top)
        return out

    def div_pos_order(self, rest):
        by = {}
        for t in rest:
            by.setdefault(DIV_OF[t], []).append(t)
        order = []
        for d, ts in by.items():
            order += self.ranked(ts, "div")
        return order

    def seeds(self):
        """Per conference: the seven playoff clubs in seed order, plus each division's winner."""
        res = {}
        winners_all = {}
        for conf in CONFS:
            winners = []
            for d in DIV_NAMES:
                if d.startswith(conf):
                    ts = [TI[x] for x in DIVISIONS[d]]
                    winners.append(self.ranked(ts, "div")[0])
            wset = set(winners)
            seeded = []
            by = {}
            for t in winners:
                by.setdefault(round(self.pct(t), 9), []).append(t)
            for v in sorted(by, reverse=True):
                seeded += self.order(by[v], "wc") if len(by[v]) > 1 else by[v]
            others = [t for t in range(32) if CONF_OF[t] == conf and t not in wset]
            wild = self.ranked(others, "wc")[:3]
            res[conf] = seeded + wild
            winners_all[conf] = wset
        return res, winners_all


def build_results(games, outcomes):
    """Per team (opp, result) lists, wins and games played. outcomes: {game index: 1 home wins | 0 away wins}."""
    g = [[] for _ in range(32)]
    w = [0.0] * 32
    n = [0] * 32
    for i, gm in enumerate(games):
        a, h = gm["away"], gm["home"]
        if gm["hs"] is not None:
            hr = 1.0 if gm["hs"] > gm["as"] else 0.5 if gm["hs"] == gm["as"] else 0.0
        elif i in outcomes:
            hr = float(outcomes[i])
        else:
            continue
        g[h].append((a, hr))
        g[a].append((h, 1 - hr))
        w[h] += hr
        w[a] += 1 - hr
        n[h] += 1
        n[a] += 1
    return g, w, n


# ---------------------------------------------------------------- bound check (clinch / elimination, sound)

def bounds(w, rem):
    """w: current wins (ties half), rem: games left. Returns {team: 'z' | 'y' | 'x' | 'e'} proven by the standings alone."""
    tags = {}
    mx = [w[t] + rem[t] for t in range(32)]
    for conf in CONFS:
        cl = [t for t in range(32) if CONF_OF[t] == conf]
        for a in cl:
            mates = [t for t in cl if DIV_OF[t] == DIV_OF[a] and t != a]
            others = [t for t in cl if t != a]
            if all(mx[t] < w[a] for t in mates):
                tags[a] = "y"
                if all(mx[t] < w[a] for t in others):
                    tags[a] = "z"
                continue
            # clinched a spot: clubs that could finish at or above his current wins, by division
            per = {}
            for t in others:
                if mx[t] >= w[a]:
                    per[DIV_OF[t]] = per.get(DIV_OF[t], 0) + 1
            if sum(max(0, c - 1) for c in per.values()) < 3:
                tags[a] = "x"
                continue
            # eliminated: clubs already strictly above his best finish
            ahead = {}
            for t in others:
                if w[t] > mx[a]:
                    ahead[DIV_OF[t]] = ahead.get(DIV_OF[t], 0) + 1
            if ahead.get(DIV_OF[a], 0) >= 1 and sum(max(0, c - 1) for c in ahead.values()) >= 3:
                tags[a] = "e"
    return tags


# ---------------------------------------------------------------- the simulation

def playoff_games(seeds, rate, rng):
    """Play one conference's bracket from its seven seeded clubs; returns (champion, set of clubs in the field)."""
    def win(home, away, neutral=False):
        d = rate[home] - rate[away] + (0 if neutral else HFA)
        return home if rng.random() < phi(d / SIGMA) else away

    s = seeds
    w1 = [win(s[1], s[6]), win(s[2], s[5]), win(s[3], s[4])]
    rest = sorted(w1, key=lambda t: s.index(t))
    d1 = [win(s[0], rest[2]), win(rest[0], rest[1])]
    d1.sort(key=lambda t: s.index(t))
    return win(d1[0], d1[1])


def simulate(games, rate, rng, sims):
    rem = [i for i, g in enumerate(games) if g["hs"] is None]
    probs = [p_home(games[i], rate)[0] for i in rem]
    remcount = [0] * 32
    for i in rem:
        remcount[games[i]["away"]] += 1
        remcount[games[i]["home"]] += 1
    acc = {k: [0] * 32 for k in ("playoffs", "division", "bye", "conf", "sb")}
    seedc = [[0] * 7 for _ in range(32)]
    winsum = [0.0] * 32
    base_g, base_w, base_n = build_results(games, {})
    rnd = rng.random
    for _ in range(sims):
        g = [list(x) for x in base_g]
        w = list(base_w)
        n = list(base_n)
        for j, i in enumerate(rem):
            gm = games[i]
            h, a = gm["home"], gm["away"]
            hr = 1.0 if rnd() < probs[j] else 0.0
            g[h].append((a, hr))
            g[a].append((h, 1 - hr))
            w[h] += hr
            w[a] += 1 - hr
            n[h] += 1
            n[a] += 1
        s = Season(g, w, n, rng)
        seeds, winners = s.seeds()
        champs = []
        for conf in CONFS:
            sd = seeds[conf]
            for k, t in enumerate(sd):
                acc["playoffs"][t] += 1
                seedc[t][k] += 1
            for t in winners[conf]:
                acc["division"][t] += 1
            acc["bye"][sd[0]] += 1
            champ = playoff_games(sd, rate, rng)
            acc["conf"][champ] += 1
            champs.append(champ)
        sb = champs[0] if rng.random() < phi((rate[champs[0]] - rate[champs[1]]) / SIGMA) else champs[1]
        acc["sb"][sb] += 1
        for t in range(32):
            winsum[t] += w[t]
    return acc, seedc, winsum, remcount


# ---------------------------------------------------------------- clinch scenarios

def scenarios(games, base_w, base_rem, week, tags_now):
    wk_games = [i for i, g in enumerate(games) if g["week"] == week and g["hs"] is None]
    out = []
    kinds = [("z", "the top seed and the bye"), ("y", None), ("x", "a playoff spot"), ("e", None)]
    gt = {i: (games[i]["away"], games[i]["home"]) for i in wk_games}
    RANK = {"x": 1, "y": 2, "z": 3}
    for a in range(32):
        if tags_now.get(a) == "e":
            continue
        conf = CONF_OF[a]
        for kind, what in kinds:
            if kind != "e" and RANK.get(tags_now.get(a), 0) >= RANK[kind]:
                continue
            wa = base_w[a]
            ma = base_w[a] + base_rem[a]
            rel = []
            for i in wk_games:
                x, y = gt[i]
                if a in (x, y):
                    rel.append(i)
                    continue
                for t in (x, y):
                    if CONF_OF[t] != conf:
                        continue
                    if (kind != "e" and base_w[t] + base_rem[t] >= wa) or (kind == "e" and base_w[t] >= ma - 1):
                        rel.append(i)
                        break
            if not rel or len(rel) > 11:
                continue
            k = len(rel)
            passmask = []
            for mask in range(1 << k):
                w2 = list(base_w)
                r2 = list(base_rem)
                for b, i in enumerate(rel):
                    x, y = gt[i]  # away, home
                    homew = (mask >> b) & 1
                    w2[y] += homew
                    w2[x] += 1 - homew
                for i in wk_games:
                    r2[gt[i][0]] -= 1
                    r2[gt[i][1]] -= 1
                for i in wk_games:
                    if i not in rel:  # cannot change this club's status whoever wins: give it to the away side
                        w2[gt[i][0]] += 1
                tag = bounds(w2, r2).get(a)
                ok = (tag == kind) or (kind == "x" and tag in ("y", "z")) or (kind == "y" and tag == "z")
                passmask.append(ok)
            if not any(passmask) or all(passmask):
                if all(passmask) and any(passmask):
                    out.append({"club": TEAMS[a], "kind": kind, "terms": [[]], "k": k})
                continue
            imps = []
            for size in (1, 2, 3):
                for games_c in itertools.combinations(range(k), size):
                    for vals in itertools.product((0, 1), repeat=size):
                        care = sum(1 << b for b in games_c)
                        val = sum(v << b for b, v in zip(games_c, vals))
                        # no smaller implicant already inside this one
                        if any((c & care) == c and (v & c) == (val & c) and c != care for c, v in imps):
                            continue
                        free = [b for b in range(k) if not (care >> b) & 1]
                        okc = True
                        for sub in range(1 << len(free)):
                            m = val
                            for jb, b in enumerate(free):
                                if (sub >> jb) & 1:
                                    m |= 1 << b
                            if not passmask[m]:
                                okc = False
                                break
                        if okc:
                            imps.append((care, val))
            if not imps:
                continue
            terms = []
            for care, val in imps[:6]:
                lit = []
                for b in range(k):
                    if (care >> b) & 1:
                        lit.append((rel[b], (val >> b) & 1))
                terms.append(lit)
            out.append({"club": TEAMS[a], "kind": kind, "terms": terms, "k": k})
    return out


def phrase(sc, games, wk_games_idx):
    """Scenario -> plain sentence."""
    a = TI[sc["club"]]
    nick = NAMES[sc["club"]]
    conf = CONF_OF[a]
    div = DIV_OF[a]
    what = {"z": f"the {conf} top seed and the bye", "y": f"the {div}", "x": "a playoff spot"}.get(sc["kind"])
    texts = []
    for lit in sc["terms"]:
        parts = []
        for gi, homew in lit:
            g = games[gi]
            if a in (g["away"], g["home"]):
                aw = (homew == 1) == (g["home"] == a)
                parts.append("a win" if aw else "a loss")
            else:
                cand = [t for t in (g["away"], g["home"]) if CONF_OF[t] == conf] or [g["away"], g["home"]]
                same = [t for t in cand if DIV_OF[t] == div]
                t = (same or cand)[0]
                tw = (homew == 1) == (g["home"] == t)
                nm = NAMES[TEAMS[t]]
                parts.append(f"{'an' if nm[0] in 'AEIOU' else 'a'} {nm} " + ("win" if tw else "loss"))
        texts.append(" and ".join(parts) if parts else "any result")
    texts = sorted(dict.fromkeys(texts), key=lambda s: (s.count(" and "), 0 if s in ("a win", "a loss") else 1, s))
    if texts == ["any result"]:
        return f"{nick} are eliminated this week whatever happens." if sc["kind"] == "e" else f"{nick} clinch {what} this week whatever happens."
    joined = ", or ".join(texts[:3])
    if sc["kind"] == "e":
        return f"{nick} are eliminated with {joined}."
    return f"{nick} clinch {what} with {joined}."


# ---------------------------------------------------------------- picks

def picks(games, rate_all, week):
    """The coming week's games with chances, the Game of the Week and the scorecard."""
    def chance(g):
        if g["line"] is not None:
            return phi(g["line"] / SIGMA), "line"
        r = ratings(games, g["week"])
        return phi((r[g["home"]] - r[g["away"]] + HFA) / SIGMA), "rating"

    standing = {}
    for t in range(32):
        standing[t] = [0.0, 0]
    for g in games:
        if g["hs"] is None:
            continue
        hr = 1.0 if g["hs"] > g["as"] else 0.5 if g["hs"] == g["as"] else 0.0
        standing[g["home"]][0] += hr
        standing[g["home"]][1] += 1
        standing[g["away"]][0] += 1 - hr
        standing[g["away"]][1] += 1

    def rec(t):
        w, n = standing[t]
        return round(w / n, 3) if n else None

    def recstr(t):
        w = {"w": 0, "l": 0, "t": 0}
        for g in games:
            if g["hs"] is None or t not in (g["away"], g["home"]):
                continue
            mine, theirs = (g["hs"], g["as"]) if g["home"] == t else (g["as"], g["hs"])
            w["w" if mine > theirs else "t" if mine == theirs else "l"] += 1
        return f"{w['w']}-{w['l']}" + (f"-{w['t']}" if w["t"] else "")

    nxt = []
    for g in games:
        if g["week"] != week or g["hs"] is not None:
            continue
        p, basis = p_home(g, rate_all)
        nxt.append({"id": g["id"], "week": g["week"], "away": TEAMS[g["away"]], "home": TEAMS[g["home"]], "day": g["day"], "date": g["date"],
                    "time": g["time"], "line": g["line"], "pHome": round(p, 3), "basis": basis,
                    "awayRec": recstr(g["away"]), "homeRec": recstr(g["home"]),
                    "_a": g["away"], "_h": g["home"], "ratings": [round(rate_all[g["away"]], 1), round(rate_all[g["home"]], 1)]})
    # Game of the Week
    cands = [x for x in nxt if abs(x["pHome"] - 0.5) <= 12 / 100 and (rec(x["_a"]) or 0) > 0.5 and (rec(x["_h"]) or 0) > 0.5]
    gotw = min(cands, key=lambda x: (round(abs(x["pHome"] - 0.5), 2), -((rec(x["_a"]) or 0) + (rec(x["_h"]) or 0)), x["id"]), default=None)
    for x in nxt:
        x["gotw"] = x is gotw
        x.pop("_a"), x.pop("_h")

    # scorecard
    scored = []
    for g in games:
        if g["hs"] is None:
            continue
        p, basis = chance(g)
        home_won = g["hs"] > g["as"]
        tie = g["hs"] == g["as"]
        fav_home = p >= 0.5
        favp = p if fav_home else 1 - p
        toss = favp - 0.5 < TOSSUP
        scored.append({"week": g["week"], "id": g["id"], "g": g, "favHome": fav_home, "favP": favp, "toss": toss, "tie": tie,
                       "favWon": (not tie) and (home_won == fav_home)})

    def tally(rows):
        w = sum(1 for r in rows if not r["toss"] and r["favWon"])
        l = sum(1 for r in rows if not r["toss"] and not r["favWon"] and not r["tie"])
        t = sum(1 for r in rows if not r["toss"] and r["tie"])
        return {"w": w, "l": l, "t": t, "tossups": sum(1 for r in rows if r["toss"]), "pct": round(w / (w + l), 3) if w + l else None}

    last = max((r["week"] for r in scored), default=None)
    lw = [r for r in scored if r["week"] == last]
    ups = [r for r in lw if not r["favWon"] and not r["tie"] and not r["toss"]]
    up = min(ups, key=lambda r: (r["favP"] * -1, r["id"]), default=None)  # the biggest favourite beaten
    upset = None
    if up:
        g = up["g"]
        winner = g["home"] if g["hs"] > g["as"] else g["away"]
        loser = g["away"] if winner == g["home"] else g["home"]
        upset = {"id": g["id"], "winner": TEAMS[winner], "loser": TEAMS[loser], "chance": round(1 - up["favP"], 3),
                 "score": f"{max(g['hs'], g['as'])}-{min(g['hs'], g['as'])}", "winnerHome": winner == g["home"]}
    return nxt, ({
        "lastWeek": {"week": last, **tally(lw), "upset": upset} if last else None,
        "season": tally(scored),
    })


# ---------------------------------------------------------------- main

def pct(x, sims):
    return round(x / sims, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int)
    ap.add_argument("--cut-week", type=int, help="backtest: ignore scores after this week")
    ap.add_argument("--out")
    ap.add_argument("--sims", type=int, default=SIMS)
    args = ap.parse_args()
    if args.season is None:
        seasons = [int(r["season"]) for r in csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")) if r["home_score"] != ""]
        args.season = max(seasons)
    games = load_games(args.season, args.cut_week)
    played = [g for g in games if g["hs"] is not None]
    remaining = [g for g in games if g["hs"] is None]
    weeks_total = max(g["week"] for g in games)
    rate = ratings(games)
    status = "live" if remaining else "final"
    week = min((g["week"] for g in remaining), default=weeks_total)
    rng = random.Random(zlib.crc32(f"playoff-odds-{args.season}-{len(played)}".encode()))
    cal = calibrate(games)

    # standings now
    base_g, base_w, base_n = build_results(games, {})
    rem_n = [0] * 32
    for g in remaining:
        rem_n[g["away"]] += 1
        rem_n[g["home"]] += 1
    tags = bounds(base_w, rem_n)
    acc, seedc, winsum, _ = simulate(games, rate, rng, args.sims)
    clubs = {}
    rec_now = {}
    for t in range(32):
        w = l = tt = pf = pa = 0
        for g in played:
            if t not in (g["away"], g["home"]):
                continue
            mine, theirs = (g["hs"], g["as"]) if g["home"] == t else (g["as"], g["hs"])
            pf += mine
            pa += theirs
            if mine > theirs:
                w += 1
            elif mine < theirs:
                l += 1
            else:
                tt += 1
        rec_now[t] = (w, l, tt)
        tag = tags.get(t)
        clubs[TEAMS[t]] = {
            "conf": CONF_OF[t], "division": DIV_OF[t], "w": w, "l": l, "t": tt, "left": rem_n[t], "diff": pf - pa,
            "rating": round(rate[t], 2),
            "playoffs": pct(acc["playoffs"][t], args.sims), "divWin": pct(acc["division"][t], args.sims),
            "bye": pct(acc["bye"][t], args.sims), "conference": pct(acc["conf"][t], args.sims), "superBowl": pct(acc["sb"][t], args.sims),
            "seeds": [pct(x, args.sims) for x in seedc[t]],
            "expWins": round(winsum[t] / args.sims, 1),
            "tag": tag,
        }
    # the bound check must agree with the simulation
    for t, tag in tags.items():
        c = clubs[TEAMS[t]]
        if tag in ("x", "y", "z") and c["playoffs"] < 1:
            raise SystemExit(f"{TEAMS[t]} clinched by the bound check but {c['playoffs']} in the simulation")
        if tag == "y" and c["divWin"] < 1:
            raise SystemExit(f"{TEAMS[t]} division clinched by the bound check but {c['divWin']} in the simulation")
        if tag == "z" and c["bye"] < 1:
            raise SystemExit(f"{TEAMS[t]} bye clinched by the bound check but {c['bye']} in the simulation")
        if tag == "e" and c["playoffs"] > 0:
            raise SystemExit(f"{TEAMS[t]} eliminated by the bound check but {c['playoffs']} in the simulation")

    final_seeds = None
    if status == "final":
        # the real field from the final standings, with the same tiebreakers
        s = Season(base_g, base_w, base_n, rng)
        seeds, winners = s.seeds()
        final_seeds = {}
        for conf in CONFS:
            for k, t in enumerate(seeds[conf]):
                final_seeds[TEAMS[t]] = k + 1
        for t in range(32):
            c = clubs[TEAMS[t]]
            sd = final_seeds.get(TEAMS[t])
            c["seed"] = sd
            c["tag"] = "z" if sd == 1 else "y" if sd and TEAMS[t] and t in winners[CONF_OF[t]] else "x" if sd else "e"
    scen = []
    picks_games, scorecard = [], None
    if status == "live":
        for sc in scenarios(games, base_w, rem_n, week, tags):
            sc["text"] = phrase(sc, games, None)
            sc.pop("k", None)
            sc.pop("terms")
            scen.append(sc)
        # a weaker clinch that needs exactly what a stronger one needs is not listed twice
        tail = lambda x: x["text"].split(" with ", 1)[-1]  # noqa: E731
        order = {"z": 0, "y": 1, "x": 2, "e": 3}
        scen = [x for x in scen if not any(o["club"] == x["club"] and order[o["kind"]] < order[x["kind"]] and x["kind"] != "e" and tail(o) == tail(x) for o in scen)]
        scen.sort(key=lambda x: (order[x["kind"]], x["club"]))
    picks_games, scorecard = picks(games, rate, week)
    gotw = next((x["id"] for x in picks_games if x["gotw"]), None)
    data = {
        "_about": "NFL edition: playoff odds, clinch scenarios and next week's picks. Built by scripts/nfl/playoff_odds.py from games.csv (see its docstring for the model).",
        "season": args.season, "status": status, "week": week, "weeksTotal": weeks_total, "played": len(played), "left": len(remaining),
        "sims": args.sims if status == "live" else 0,
        "method": {
            "line": "Win chance = Phi(spread / 13.45) where the game has a posted line, else club ratings (point differential per game, shrunk) plus home field.",
            "sigma": SIGMA, "hfa": HFA, "shrink": SHRINK, "calibration": cal,
        },
        "clubs": clubs,
        "scenarios": scen,
        "picks": {"week": week, "games": picks_games, "gameOfTheWeek": gotw, "scorecard": scorecard},
    }
    out = Path(args.out) if args.out else WORK / "playoff_odds.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, separators=(",", ":"), sort_keys=False) + "\n")
    print(f"playoff_odds: {args.season} {status} week {week}, {len(played)} played, {len(remaining)} left, {args.sims} sims, "
          f"{sum(1 for c in clubs.values() if c['tag'])} marked, {len(scen)} scenarios, {len(picks_games)} picks -> {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")


if __name__ == "__main__":
    main()
