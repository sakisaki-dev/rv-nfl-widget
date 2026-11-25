# rv-nfl-widget

The data feed for the Retro Vault NFL iPhone widget (Scriptable). Public, no key needed.

- `widget.json` is rebuilt every morning by GitHub Actions (`.github/workflows/daily.yml`, 14:07 UTC: 6:07 am Pacific in
  winter, 7:07 am in summer; also runnable by hand with `gh workflow run daily.yml`). It downloads the season's public
  nflverse files (games, injuries, rosters, depth charts, weekly player stats, snap counts), then runs, in `scripts/`:
  `injuries.py`, `depth_charts.py`, `season_ovr.py` (SZN), `playoff_odds.py` (10,000 seeded simulations) and
  `widget_data.py`, and commits `widget.json` when it changed. Python standard library only. Nothing runs on a Mac.
- `widget-sprites/`, `widget-art/`, `rv-nfl-widget.js` and `inputs/` (players who can play this season with their
  nflverse ids and clubs, ESPN ids, the art paths) come from the Retro Vault NFL edition on the owner's Mac, by hand
  and only now and then: `bash scripts/nfl/widget_publish.sh` there (new players' sprites, a code change). CI never
  draws sprites: a player with no sprite file yet is drawn without one (logo or number).
- Served from `https://raw.githubusercontent.com/sakisaki-dev/rv-nfl-widget/main/<file>` and from GitHub Pages,
  `https://sakisaki-dev.github.io/rv-nfl-widget/<file>`. The widget tries raw, then Pages, then its cache.

Install: in Scriptable, paste the NFL edition's `public/widgets/rv-nfl-install.js` into a new script; it loads
`rv-nfl-widget.js` from this repo on every run (cached for offline), so code and data update themselves.

Data: [nflverse](https://github.com/nflverse/nflverse-data) (CC-BY 4.0). Live scores in the widget come from ESPN's
public API.
