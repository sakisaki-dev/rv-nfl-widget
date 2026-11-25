#!/usr/bin/env python3
"""Download the season-in-progress nflverse files the widget build reads into cache/ (always fresh).

    python3 scripts/fetch.py

Source: https://github.com/nflverse/nflverse-data releases (public, CC-BY 4.0), no token. A file the release doesn't
have yet (early in a season) is reported and skipped; the build then leaves that part out. Any other failure is fatal.
"""
import sys
import time
import urllib.error
import urllib.request

from common import CACHE, SEASON

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
FILES = [  # (release tag, asset)
    ("schedules", "games.csv.gz"),                       # scores, lines, kickoffs: playoff odds, schedule
    ("injuries", f"injuries_{SEASON}.csv"),              # the weekly injury report
    ("rosters", f"roster_{SEASON}.csv"),                 # IR, current clubs
    ("depth_charts", f"depth_charts_{SEASON}.csv.gz"),   # the club's starters
    ("stats_player", f"stats_player_week_{SEASON}.csv.gz"),  # SZN: game lines
    ("snap_counts", f"snap_counts_{SEASON}.csv.gz"),     # SZN: games without a stat line, snap share
]


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    missing, failed = [], []
    for tag, name in FILES:
        dst = CACHE / name
        req = urllib.request.Request(f"{BASE}/{tag}/{name}", headers={"User-Agent": "rv-nfl-widget/1.0"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    data = r.read()
                tmp = dst.with_suffix(dst.suffix + ".part")
                tmp.write_bytes(data)
                tmp.replace(dst)
                print(f"  {name}: {len(data) // 1024} KB")
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    missing.append(name)
                    break
                print(f"  retry {name}: HTTP {e.code}", file=sys.stderr)
            except Exception as e:  # noqa: BLE001
                print(f"  retry {name}: {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
        else:
            failed.append(name)
    print(f"nflverse {SEASON}: {len(FILES) - len(missing) - len(failed)} downloaded, {len(missing)} not published yet"
          + (f" ({', '.join(missing)})" if missing else ""))
    if failed or "games.csv.gz" in missing:
        sys.exit(f"download failed: {', '.join(failed + [m for m in missing if m == 'games.csv.gz'])}")


if __name__ == "__main__":
    main()
