// Retro Vault NFL widget for Scriptable (iOS): follows one club (the Vikings) through the NFL season. One script, every
// size (config.widgetFamily): large, medium, small and the lock screen's inline, circular and rectangular. It decides
// what to show each time it runs:
//
//   1  the club's game is live        the live game (score bug, drive, field, leaders, team stats, win chance), read from
//                                     ESPN's public scoreboard and the game's summary
//   2  a primetime game is live       the same view for that game
//   3  Sunday with games on           the slate (large) or the score ticker (medium, small)
//   4  within 12 hours after the game the final with its stars and the playoff odds change
//   5  the day before                 the preview: the opponent, kickoff, win chance
//   6  weekdays                       a rotating between-games view: the club card, the playoff race, the MVP race
//   7  the offseason                  the season in the books
//
// Data: widget.json and its sprites and art (rebuilt daily on GitHub Actions in the repo below; scripts/nfl/widget_data.py
// is the local copy), live scores from ESPN. Both are cached, so it still draws offline.
//
// Refresh (refreshAfterDate): every 5 minutes while the club plays, every 10 while other games are live, at kickoff
// (waking up exactly then) before a game, once in the morning on weekdays. iOS treats the date as a hint, so a phone in
// Low Power Mode can run it late; five minutes is the best a widget can do.
//
// Tap: the widget's Parameter field. Empty = open the site (SITE). A Shortcut's name = run it. A URL = open it. The
// word `bug` (alone or inside the text) pins the live view to the broadcast score-bug style; `classic` pins the
// first one; otherwise they alternate.

// ---------- where the data lives ----------
// The public repo github.com/sakisaki-dev/rv-nfl-widget: a GitHub Actions workflow there rebuilds widget.json every
// morning from nflverse (nothing runs on a Mac); scripts/nfl/widget_publish.sh pushes the sprites, art and this code.
// Read from raw.githubusercontent.com first, then the same files on GitHub Pages, then the last cached copy: no key,
// no API rate limit. LAN_BASE is an optional override for testing: `npm run nfl:dev` serves public/ at :4174 on the
// LAN, e.g. 'http://192.168.1.243:4174/'.
const REPO = 'sakisaki-dev/rv-nfl-widget';
const PAGES = 'https://sakisaki-dev.github.io/rv-nfl-widget/';
const LAN_BASE = '';
const SITE = 'https://github.com/' + REPO;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
// Kept for the offline screen's wording: the repo is public, so a key is never needed
const TOKEN = 'public';
// widget.json names files by their site path ('data/nfl/widget-sprites/x.png'); the repo keeps them without 'data/nfl/'
const repoPath = (p) => p.replace(/^data\/nfl\//, '');
// Where one of our files can be fetched, in order: raw GitHub, then Pages
function dataUrls(path) {
  if (LAN_BASE) return [LAN_BASE + path];
  return [`https://raw.githubusercontent.com/${REPO}/main/${repoPath(path)}`, PAGES + repoPath(path)];
}

// ---------- look ----------
const HEX = {
  night: '#070b16', night2: '#10162b', panel: '#111627', panel2: '#1a2137', line: '#2a3352', gold: '#ffd84a',
  goldHi: '#ffe58a', goldDeep: '#b8741a', chalk: '#eef1f8', dim: '#98a2bf', live: '#ff4545', up: '#26d980', amber: '#ffb347',
};
const C = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, new Color(v)]));
const dispI = (s) => new Font('AvenirNextCondensed-HeavyItalic', s); // the scores (Barlow Condensed italic)
const disp = (s) => new Font('AvenirNextCondensed-Heavy', s);
const bodyF = (s) => Font.mediumSystemFont(s);
const boldF = (s) => Font.boldSystemFont(s);
const semiF = (s) => Font.semiboldSystemFont(s);

// nflverse abbreviation: [nickname, primary, secondary, ESPN logo slug, ESPN abbreviation]
const TEAMS = {
  ARI: ['Cardinals', '#97233F', '#000000', 'ari', 'ARI'], ATL: ['Falcons', '#A71930', '#000000', 'atl', 'ATL'],
  BAL: ['Ravens', '#241773', '#9E7C0C', 'bal', 'BAL'], BUF: ['Bills', '#00338D', '#C60C30', 'buf', 'BUF'],
  CAR: ['Panthers', '#101820', '#0085CA', 'car', 'CAR'], CHI: ['Bears', '#0B162A', '#C83803', 'chi', 'CHI'],
  CIN: ['Bengals', '#FB4F14', '#111111', 'cin', 'CIN'], CLE: ['Browns', '#311D00', '#FF3C00', 'cle', 'CLE'],
  DAL: ['Cowboys', '#869397', '#003594', 'dal', 'DAL'], DEN: ['Broncos', '#FB4F14', '#002244', 'den', 'DEN'],
  DET: ['Lions', '#0076B6', '#B0B7BC', 'det', 'DET'], GB: ['Packers', '#203731', '#FFB612', 'gb', 'GB'],
  HOU: ['Texans', '#03202F', '#A71930', 'hou', 'HOU'], IND: ['Colts', '#002C5F', '#A2AAAD', 'ind', 'IND'],
  JAX: ['Jaguars', '#006778', '#D7A22A', 'jax', 'JAX'], KC: ['Chiefs', '#E31837', '#FFB81C', 'kc', 'KC'],
  LAC: ['Chargers', '#0080C6', '#FFC20E', 'lac', 'LAC'], LAR: ['Rams', '#FFD100', '#003594', 'lar', 'LAR'],
  LV: ['Raiders', '#A5ACAF', '#000000', 'lv', 'LV'], MIA: ['Dolphins', '#008E97', '#FC4C02', 'mia', 'MIA'],
  MIN: ['Vikings', '#4F2683', '#FFC62F', 'min', 'MIN'], NE: ['Patriots', '#002244', '#C60C30', 'ne', 'NE'],
  NO: ['Saints', '#D3BC8D', '#101820', 'no', 'NO'], NYG: ['Giants', '#0B2265', '#A71930', 'nyg', 'NYG'],
  NYJ: ['Jets', '#125740', '#FFFFFF', 'nyj', 'NYJ'], PHI: ['Eagles', '#004C54', '#A5ACAF', 'phi', 'PHI'],
  PIT: ['Steelers', '#FFB612', '#101820', 'pit', 'PIT'], SEA: ['Seahawks', '#4C8C2B', '#002244', 'sea', 'SEA'],
  SF: ['49ers', '#AA0000', '#B3995D', 'sf', 'SF'], TB: ['Buccaneers', '#D50A0A', '#34302B', 'tb', 'TB'],
  TEN: ['Titans', '#4B92DB', '#0C2340', 'ten', 'TEN'], WAS: ['Commanders', '#5A1414', '#FFB612', 'wsh', 'WSH'],
};
const ESPN_ABBR = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX', OAK: 'LV' }; // ESPN's abbreviation -> nflverse's
const abbrOf = (a) => ESPN_ABBR[a] || a;
const tm = (a) => TEAMS[a] || ['', '#2a3352', '#ffd84a', 'nfl', a];
const primary = (a) => tm(a)[1];
const secondary = (a) => tm(a)[2];
// A club colour made legible against dark panels
const lumOf = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
// Club colour for strips and bars on dark panels: the primary, or the secondary when the primary is nearly black/navy
const stripColor = (a) => (lumOf(primary(a)) < 0.03 ? secondary(a) : primary(a));
// A club colour for text and thin lines on dark panels: lifted toward white when it is too dark to read
const inkOf = (a) => { const c = stripColor(a); return lumOf(c) < 0.12 ? mixHex(c, '#ffffff', lumOf(c) < 0.05 ? 0.55 : 0.4) : c; };
const stripEdge = (a) => (stripColor(a) === primary(a) ? secondary(a) : primary(a));

// ---------- family, size, time ----------
const FORCE = (typeof RV_FORCE !== 'undefined' && RV_FORCE) || {}; // harness only: {mode, style, lock}
const FAMILY = (typeof RV_FAMILY !== 'undefined' && RV_FAMILY) || config.widgetFamily || 'large';
const PARAM = String((typeof args !== 'undefined' && args && args.widgetParameter) || (typeof RV_PARAM !== 'undefined' && RV_PARAM) || '').trim();
const NOW = typeof RV_NOW !== 'undefined' && RV_NOW ? new Date(RV_NOW) : new Date();
const NOWMS = NOW.getTime();
const SCALE = (() => { try { return Device.screenScale() || 3; } catch (e) { return 3; } })();
const WIDGET_SIZES = {
  '430x932': [170, 364, 382], '428x926': [170, 364, 382], '414x896': [169, 360, 379], '414x736': [159, 348, 357],
  '393x852': [158, 338, 354], '390x844': [158, 338, 354], '375x812': [155, 329, 345], '375x667': [148, 321, 324],
  '320x568': [141, 292, 311],
};
function widgetSize(family) {
  let row;
  try {
    const s = Device.screenSize();
    const w = Math.round(Math.min(s.width, s.height)), h = Math.round(Math.max(s.width, s.height));
    row = WIDGET_SIZES[`${w}x${h}`] || (Device.isPad() ? [158, 338, 354] : [Math.round(w * 0.405), Math.round(w * 0.867), Math.round(w * 0.908)]);
  } catch (e) { row = [158, 338, 354]; }
  const [sm, wide, tall] = row;
  return family === 'small' ? { w: sm, h: sm } : family === 'medium' ? { w: wide, h: sm } : { w: wide, h: tall };
}
const tap = (url) => {
  const p = PARAM.replace(/\b(bug|classic)\b/gi, '').trim();
  if (!p) return url;
  if (/^http/i.test(p) || p.includes('://')) return p;
  return 'shortcuts://run-shortcut?name=' + encodeURIComponent(p);
};
const mod = (a, n) => ((a % n) + n) % n;
const arr = (x) => (Array.isArray(x) ? x : []);
const pct = (p) => (p == null ? '' : p >= 0.995 ? '>99%' : p < 0.005 && p > 0 ? '<1%' : Math.round(p * 100) + '%');
const MIN = 60e3, HOUR = 3600e3;
const dayNum = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const TODAY = dayNum(NOW);
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clockText = (d) => { const h = d.getHours(), m = d.getMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };
const clockAmPm = (d) => `${clockText(d)} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const kickShort = (iso) => { const d = new Date(iso); return `${DAYS[d.getDay()]} ${clockText(d)}`; };
const kickText = (iso) => { const d = new Date(iso); return `${DAYS[d.getDay()]} ${clockText(d)} ${d.getHours() < 12 ? 'AM' : 'PM'}`; };
function untilText(ms) {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m >= 2880) return `${Math.floor(m / 1440)}d ${Math.round((m % 1440) / 60)}h`;
  if (m >= 1440) return `1d ${Math.round((m - 1440) / 60)}h`;
  if (m >= 90) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

// ---------- files, cache, requests ----------
const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), 'rv-nfl');
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);
const safe = (s) => s.replace(/[^a-z0-9.]+/gi, '_').slice(-120);
const cachePath = (k) => fm.joinPath(cacheDir, safe(k));
const ageOf = (p) => { try { return NOWMS - fm.modificationDate(p).getTime(); } catch (e) { return Infinity; } };
// src: a URL (ESPN) or {path} (our data: raw GitHub, then Pages). Returns the Requests to try in order.
function makeRequests(src, timeout) {
  return (typeof src === 'string' ? [src] : dataUrls(src.path)).map((u) => {
    const r = new Request(u);
    r.timeoutInterval = timeout || 10;
    return r;
  });
}
// JSON from the network, else the last good copy. maxAge (ms): a cached copy younger than that skips the network.
async function getJson(src, key, maxAge = 0) {
  const p = cachePath(key);
  if (maxAge && fm.fileExists(p) && ageOf(p) < maxAge) {
    try { return JSON.parse(fm.readString(p)); } catch (e) { /* refetch */ }
  }
  for (const r of makeRequests(src)) {
    try {
      const text = await r.loadString();
      if (r.response && r.response.statusCode >= 400) throw new Error('http');
      if (/^\s*</.test(text)) throw new Error('html');
      const data = JSON.parse(text);
      try { fm.writeString(p, text); } catch (e) { /* best effort */ }
      return data;
    } catch (e) { /* the next source */ }
  }
  if (fm.fileExists(p)) { try { return JSON.parse(fm.readString(p)); } catch (e2) { /* none */ } }
  return null;
}
const IMGS = {};
// An image from the network, kept in the cache (fresh for maxAge ms), else the stale copy, else null
async function getImage(src, key, maxAge = 864e5, minWidth = 8) {
  if (key in IMGS) return IMGS[key];
  const p = cachePath(key);
  let img = null;
  if (fm.fileExists(p) && ageOf(p) < maxAge) { try { img = fm.readImage(p); } catch (e) { img = null; } }
  if (!img) {
    for (const r of makeRequests(src, 8)) {
      try {
        const got = await r.loadImage();
        if (got && got.size && got.size.width >= minWidth) { img = got; try { fm.writeImage(p, got); } catch (e) { /* best effort */ } break; }
      } catch (e) { /* the next source, else offline */ }
    }
  }
  if (!img && fm.fileExists(p)) { try { img = fm.readImage(p); } catch (e) { img = null; } }
  return (IMGS[key] = img);
}
const dataImage = (path) => (path ? getImage({ path }, 'd-' + path, 7 * 864e5, 4) : Promise.resolve(null));
async function logoImage(abbr) {
  const slug = tm(abbr)[3];
  return getImage(`https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/${slug}.png&h=120&w=120`, `logo-${slug}.png`, 30 * 864e5);
}

// ---------- drawing primitives ----------
const rgba = (hex, a) => new Color(hex, a == null ? 1 : a);
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('');
}
function newCtx(w, h) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  return dc;
}
function fillRounded(dc, x, y, w, h, r, color) {
  const p = new Path();
  p.addRoundedRect(new Rect(x, y, w, h), r, r);
  dc.addPath(p);
  dc.setFillColor(color);
  dc.fillPath();
}
function strokeRounded(dc, x, y, w, h, r, lw, color) {
  const p = new Path();
  p.addRoundedRect(new Rect(x, y, w, h), r, r);
  dc.addPath(p);
  dc.setStrokeColor(color);
  dc.setLineWidth(lw);
  dc.strokePath();
}
const R = (dc, x, y, w, h, color) => { dc.setFillColor(color); dc.fillRect(new Rect(x, y, w, h)); };
function glow(dc, cx, cy, rx, ry, hex, peak) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const k = 1 - i / n;
    dc.setFillColor(rgba(hex, peak / n));
    dc.fillEllipse(new Rect(cx - rx * k, cy - ry * k, 2 * rx * k, 2 * ry * k));
  }
}
function fillVertical(dc, x, y, w, h, top, bottom, bands = 40, alpha = 1) {
  for (let i = 0; i < bands; i++) {
    dc.setFillColor(rgba(mixHex(top, bottom, i / (bands - 1)), alpha));
    dc.fillRect(new Rect(x, y + (h * i) / bands, w, h / bands + 0.6));
  }
}
// Text in a box (DrawContext text does not wrap or shrink: the caller measures). y is the top of the line box.
function T(dc, s, x, y, w, size, opts = {}) {
  dc.setFont(opts.font || bodyF(size));
  dc.setTextColor(opts.color || C.chalk);
  if (opts.align === 'center') dc.setTextAlignedCenter();
  else if (opts.align === 'right') dc.setTextAlignedRight();
  else dc.setTextAlignedLeft();
  dc.drawTextInRect(String(s), new Rect(x, y, w, opts.h || Math.ceil(size * 1.3)));
}
// Width estimates (points) of a string at a size: condensed display fonts ~0.43 em a character, system ~0.55
const estW = (s, size, kind = 'sys') => String(s).length * size * (kind === 'cond' ? 0.54 : 0.55);
function fitSize(s, maxW, size, kind = 'sys', min = 7) {
  let z = size;
  while (z > min && estW(s, z, kind) > maxW) z -= 0.5;
  return z;
}
function clip(s, maxW, size, kind = 'sys') {
  const per = size * (kind === 'cond' ? 0.54 : 0.55);
  const n = Math.max(3, Math.floor(maxW / per));
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

// ---------- pixel text (5-row font after Silkscreen) ----------
const GLYPHS = {
  A: ['.##.', '#..#', '####', '#..#', '#..#'], B: ['###.', '#..#', '###.', '#..#', '###.'], C: ['.###', '#...', '#...', '#...', '.###'],
  D: ['###.', '#..#', '#..#', '#..#', '###.'], E: ['####', '#...', '###.', '#...', '####'], F: ['####', '#...', '###.', '#...', '#...'],
  G: ['.###', '#...', '#.##', '#..#', '.###'], H: ['#..#', '#..#', '####', '#..#', '#..#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..##', '...#', '...#', '#..#', '.##.'], K: ['#..#', '#.#.', '##..', '#.#.', '#..#'], L: ['#...', '#...', '#...', '#...', '####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '###.', '#...', '#...'], Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'], R: ['###.', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '###.'], T: ['#####', '..#..', '..#..', '..#..', '..#..'], U: ['#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#..#', '#..#', '.##.', '#..#', '#..#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'], Z: ['####', '..#.', '.#..', '#...', '####'],
  0: ['.##.', '#.##', '##.#', '#..#', '.##.'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###.', '...#', '.##.', '#...', '####'],
  3: ['###.', '...#', '.##.', '...#', '###.'], 4: ['#..#', '#..#', '####', '...#', '...#'], 5: ['####', '#...', '###.', '...#', '###.'],
  6: ['.##.', '#...', '###.', '#..#', '.##.'], 7: ['####', '...#', '..#.', '.#..', '.#..'], 8: ['.##.', '#..#', '.##.', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '.##.'], ' ': ['..', '..', '..', '..', '..'], '·': ['.', '.', '#', '.', '.'],
  ':': ['.', '#', '.', '#', '.'], '-': ['...', '...', '###', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
  '%': ['#..#', '...#', '..#.', '.#..', '#..#'], '/': ['...#', '..#.', '.#..', '#...', '....'], '.': ['.', '.', '.', '.', '#'],
  '!': ['#', '#', '#', '.', '#'], '&': ['.#..', '#.#.', '.#.#', '#.#.', '.#.#'], '@': ['.###.', '#.#.#', '#.###', '#....', '.###.'],
  '#': ['#.#', '###', '#.#', '###', '#.#'], '$': ['.###', '##..', '.##.', '..##', '###.'], '?': ['###.', '...#', '.##.', '....', '.#..'],
};
const glyphW = (ch) => (GLYPHS[ch] || GLYPHS[' '])[0].length;
const pixW = (s) => [...String(s).toUpperCase()].reduce((n, ch) => n + glyphW(ch) + 1, 0) - 1;
// Pixel text drawn into a context at (x, y): px = points per art pixel. Returns the width drawn.
function pix(dc, s, x, y, px, hex, shadow) {
  let cx = 0;
  for (const ch of String(s).toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    g.forEach((row, ry) => [...row].forEach((c, rx) => {
      if (c !== '#') return;
      if (shadow) R(dc, x + (cx + rx) * px + px * 0.6, y + ry * px + px * 0.6, px, px, rgba('#000000', 0.55));
    }));
    g.forEach((row, ry) => [...row].forEach((c, rx) => {
      if (c === '#') R(dc, x + (cx + rx) * px, y + ry * px, px, px, new Color(hex));
    }));
    cx += g[0].length + 1;
  }
  return (cx - 1) * px;
}
const PX = Math.max(1, Math.round(1.34 * SCALE)) / SCALE; // a pixel-font pixel on device pixels
const pixRight = (dc, s, xr, y, px, hex, shadow) => pix(dc, s, xr - pixW(s) * px, y, px, hex, shadow);
const pixCenter = (dc, s, xc, y, px, hex, shadow) => pix(dc, s, xc - (pixW(s) * px) / 2, y, px, hex, shadow);

// ---------- images in a context ----------
// Draw one sprite with its centre line at x and the bottom of its feet at y (points). k device pixels per game pixel;
// the files are 6x, so k of 2, 3 or 6 draws every game pixel whole.
function drawSprite(dc, img, x, y, k) {
  if (!img) return;
  const u = k / SCALE;
  const snap = (v) => Math.round(v * SCALE) / SCALE;
  dc.drawImageInRect(img, new Rect(snap(x - 32 * u), snap(y - 59 * u), 64 * u, 64 * u));
}
// A rectangle of an image as a new image (DrawContext clips to its bounds)
function cropImage(img, sx, sy, sw, sh, drawW, drawH, outW, outH) {
  const dc = newCtx(outW, outH);
  dc.drawImageInRect(img, new Rect(-sx, -sy, drawW, drawH));
  return dc.getImage();
}
// A player's head and shoulders in a rounded tile in his club's colours (the site's bust)
function bustImage(sprite, size, abbr, ring) {
  const dc = newCtx(size, size);
  const c1 = stripColor(abbr), c2 = stripEdge(abbr);
  fillRounded(dc, 0, 0, size, size, size * 0.26, new Color(c1));
  fillVertical(dc, 0, size * 0.55, size, size * 0.45, c1, mixHex(c1, '#000000', 0.45), 12, 0.55);
  if (sprite) {
    const s = size / 32; // game pixels 16..48 x 3..35
    dc.drawImageInRect(sprite, new Rect(-16 * s, -3 * s, 64 * s, 64 * s));
  }
  strokeRounded(dc, 0.75, 0.75, size - 1.5, size - 1.5, size * 0.26, 1.5, new Color(ring || c2));
  return dc.getImage();
}
// A club-colour name strip (the site's player names)
function nameStrip(dc, text, x, y, abbr, size = 13, align = 'left', maxW = 120) {
  const t = clip(text.toUpperCase(), maxW - 12, size, 'cond');
  const w = Math.min(maxW, estW(t, size, 'cond') + 12);
  const bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  fillRounded(dc, bx, y, w, size + 5, 4, new Color(stripColor(abbr)));
  fillRounded(dc, bx + 1, y + size + 2.5, w - 2, 1.5, 0.75, new Color(stripEdge(abbr)));
  T(dc, t, bx, y + 1.5, w, size, { font: dispI(size), color: Color.white(), align: 'center' });
  return { x: bx, w };
}
// Whole-device-pixel drawing of a pre-scaled art piece at k device pixels per art pixel; (x, y) its top-left corner
function drawArt(dc, img, x, y, artW, artH, k) {
  if (!img) return;
  const u = k / SCALE;
  dc.drawImageInRect(img, new Rect(Math.round(x * SCALE) / SCALE, Math.round(y * SCALE) / SCALE, artW * u, artH * u));
}

// ---------- widget shell: the one gold gradient rim, the club colours behind ----------
function roundedPoints(x, y, w, h, r, step) {
  const pts = [];
  const arc = (cx, cy, a0) => {
    const n = Math.max(4, Math.ceil((Math.PI / 2) * r / step));
    for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * (i / n); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  };
  const line = (x1, y1, x2, y2) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let i = 1; i < n; i++) pts.push([x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
  };
  arc(x + r, y + r, Math.PI); line(x + r, y, x + w - r, y);
  arc(x + w - r, y + r, -Math.PI / 2); line(x + w, y + r, x + w, y + h - r);
  arc(x + w - r, y + h - r, 0); line(x + w - r, y + h, x + r, y + h);
  arc(x + r, y + h - r, Math.PI / 2); line(x, y + h - r, x, y + r);
  return pts;
}
function strokeGoldRim(dc, x, y, w, h, r, lw) {
  const pts = roundedPoints(x, y, w, h, r, 2);
  const shade = (px, py) => {
    const t = ((px - x) / w + (py - y) / h) / 2;
    const hex = t < 0.3 ? mixHex(HEX.goldHi, HEX.gold, t / 0.3) : mixHex(HEX.gold, HEX.goldDeep, (t - 0.3) / 0.7);
    const a = t < 0.35 ? 0.95 : 0.95 - (t - 0.35) * 1.05;
    return [hex, Math.max(0.2, Math.min(1, a))];
  };
  dc.setLineWidth(lw);
  let path = null, cur = null;
  const flush = () => { if (path) { dc.addPath(path); dc.setStrokeColor(rgba(cur[0], cur[1])); dc.strokePath(); } };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const s = shade(a[0], a[1]);
    const q = [s[0], Math.round(s[1] * 20) / 20];
    if (!cur || q[0] !== cur[0] || q[1] !== cur[1]) { flush(); path = new Path(); path.move(new Point(a[0], a[1])); cur = q; }
    path.addLine(new Point(b[0], b[1]));
  }
  flush();
}
const RIM_INSET = 3, RIM_W = 1.7, RIM_R = 19;
const PAD = { side: 14, top: 14, bottom: 12 };
// kinds: 'duo' (the two clubs split on a diagonal), 'solo' (one club), 'league' (night with colour corners), 'night'
let BGFN = () => '#0b1020'; // the colour behind any point of the widget (to patch rounded corners over it)
function backgroundCtx(w, h, kind, a, b, logos) {
  const dc = newCtx(w, h);
  const A = primary(a || 'MIN'), B = b ? primary(b) : secondary(a || 'MIN');
  const base = '#0b1020';
  if (kind === 'duo') {
    const mixA = mixHex(base, stripColor(a), 0.42), mixB = mixHex(base, stripColor(b), 0.46);
    BGFN = (x, y) => (x < w * (0.62 - 0.24 * (y / h)) ? mixA : mixB);
    R(dc, 0, 0, w, h, new Color(mixB));
    // the diagonal: A's side is everything left of the line from (0.62w, 0) to (0.38w, h)
    const n = Math.ceil(h);
    for (let i = 0; i < n; i++) {
      const y = i, xEdge = w * (0.62 - 0.24 * (i / n));
      R(dc, 0, y, xEdge, 1.2, new Color(mixA));
    }
    const dg = new Path();
    dg.move(new Point(w * 0.62, 0)); dg.addLine(new Point(w * 0.38, h));
    dc.addPath(dg); dc.setStrokeColor(rgba('#ffffff', 0.14)); dc.setLineWidth(1); dc.strokePath();
    // faint logos: the mark, then a wash of the same background colour over it
    if (logos && logos[0]) { dc.drawImageInRect(logos[0], new Rect(-w * 0.1, -h * 0.12, w * 0.5, w * 0.5)); R(dc, -w * 0.1, -h * 0.12, w * 0.5, w * 0.5, rgba(mixA, 0.85)); }
    if (logos && logos[1]) { dc.drawImageInRect(logos[1], new Rect(w * 0.6, h - w * 0.4, w * 0.5, w * 0.5)); R(dc, w * 0.6, h - w * 0.4, w * 0.5, w * 0.5, rgba(mixB, 0.85)); }
  } else if (kind === 'solo') {
    BGFN = (x, y) => (y < 3 ? secondary(a) : mixHex(base, stripColor(a), 0.46));
    R(dc, 0, 0, w, h, new Color(mixHex(base, stripColor(a), 0.46)));
    R(dc, 0, 0, w, 3, new Color(secondary(a)));
    const sm = mixHex(base, stripColor(a), 0.46);
    if (logos && logos[0]) { dc.drawImageInRect(logos[0], new Rect(w * 0.42, h * 0.3, w * 0.7, w * 0.7)); R(dc, w * 0.42, h * 0.3, w * 0.7, w * 0.7, rgba(sm, 0.85)); }
  } else {
    BGFN = (x, y) => mixHex('#10162b', '#070b16', y / h);
    fillVertical(dc, 0, 0, w, h, '#10162b', '#070b16', 64);
    R(dc, 0, 0, w, 3, new Color(stripColor(a || 'MIN')));
  }
  return dc;
}
function finishShell(dc, w, h) {
  strokeGoldRim(dc, RIM_INSET, RIM_INSET, w - 2 * RIM_INSET, h - 2 * RIM_INSET, RIM_R, RIM_W);
}
function newWidget(w, h, dc, url) {
  const wd = new ListWidget();
  wd.setPadding(0, 0, 0, 0);
  wd.backgroundImage = dc.getImage();
  if (url) wd.url = url;
  return wd;
}

// ---------- ESPN: scoreboard and summary, normalised ----------
const eNum = (x) => { const n = parseFloat(x); return isNaN(n) ? null : n; };
function normGame(e) {
  const c = (e.competitions || [])[0];
  if (!c) return null;
  const st = c.status || e.status || {};
  const side = (ha) => {
    const x = (c.competitors || []).find((k) => k.homeAway === ha);
    if (!x) return null;
    const rec = ((x.records || [])[0] || {}).summary || '';
    return { abbr: abbrOf(x.team.abbreviation), id: x.team.id || x.id, score: eNum(x.score), ls: arr(x.linescores).map((l) => eNum(l.value != null ? l.value : l.displayValue)),
      rec, name: x.team.shortDisplayName || x.team.displayName, winner: !!x.winner };
  };
  const g = { id: e.id, date: e.date, kick: Date.parse(e.date), state: (st.type || {}).state || 'pre', period: st.period || 0,
    clock: st.displayClock || '', detail: (st.type || {}).shortDetail || '', desc: (st.type || {}).description || '',
    home: side('home'), away: side('away'), venue: (c.venue || {}).fullName || '', indoor: !!(c.venue || {}).indoor,
    leaders: arr(c.leaders), headline: ((arr(c.headlines)[0]) || {}).shortLinkText || '', odds: ((arr(c.odds)[0]) || {}).details || '' };
  const s = c.situation;
  if (s) {
    const possId = s.possession;
    const poss = [g.home, g.away].find((t) => t && String(t.id) === String(possId));
    const m = /([A-Z]{2,3})\s+(\d+)/.exec(s.possessionText || s.downDistanceText || '');
    g.sit = { down: s.down, dist: s.distance, dd: s.shortDownDistanceText || s.downDistanceText || '', poss: poss ? poss.abbr : null,
      spot: m ? { side: abbrOf(m[1]), yd: +m[2] } : null, redZone: !!s.isRedZone, homeTO: s.homeTimeouts, awayTO: s.awayTimeouts,
      last: (s.lastPlay || {}).text || '' };
  }
  if (!g.home || !g.away) return null;
  return g;
}
const involves = (g, abbr) => g && (g.home.abbr === abbr || g.away.abbr === abbr);
async function loadBoard(maxAge) {
  const d = await getJson(ESPN + 'scoreboard', 'espn-scoreboard', maxAge);
  return d ? arr(d.events).map(normGame).filter(Boolean) : null;
}
async function loadSummary(id, maxAge) {
  return id ? getJson(ESPN + 'summary?event=' + id, 'espn-summary-' + id, maxAge) : null;
}
// Primetime is judged on the league's own clock (US Eastern), not the phone's, so a trip west or abroad never turns
// Sunday Night Football into an afternoon game: a kickoff at 7 pm Eastern or later (TNF, SNF, MNF, Saturday nights).
const etOffsetH = (ms) => {
  // US Eastern: EDT (UTC-4) from 2 am on the second Sunday in March to 2 am on the first Sunday in November, else EST (UTC-5)
  const y = new Date(ms).getUTCFullYear();
  const nthSunday = (month, n) => { const d = new Date(Date.UTC(y, month, 1)); const first = (7 - d.getUTCDay()) % 7; return Date.UTC(y, month, 1 + first + 7 * (n - 1)); };
  const start = nthSunday(2, 2) + 7 * 3600e3, end = nthSunday(10, 1) + 6 * 3600e3;
  return ms >= start && ms < end ? -4 : -5;
};
const etHour = (ms) => new Date(ms + etOffsetH(ms) * 3600e3).getUTCHours();
const prime = (g) => { const hr = etHour(g.kick); return hr >= 19 || hr < 3; };

// ---------- the mode ----------
// The most recent final in the board is the club's game within 12 h of its end (kickoff + about 3.5 h)
const FINAL_WINDOW = 12 * HOUR, GAME_LEN = 3.5 * HOUR;
function decide(data, board) {
  const club = data.club.abbr;
  const nk = data.next && Date.parse(data.next.kickoff);
  const lk = data.last && Date.parse(data.last.kickoff);
  const f = FORCE.mode;
  const mine = board && board.find((g) => involves(g, club));
  const live = board ? board.filter((g) => g.state === 'in') : [];
  const mineLive = live.find((g) => involves(g, club));
  const primeLive = live.find((g) => prime(g));
  const kickToday = (g) => dayNum(new Date(g.kick)) === TODAY;
  const sunday = NOW.getDay() === 0;
  const mineFinal = mine && mine.state === 'post' && NOWMS - mine.kick < GAME_LEN + FINAL_WINDOW ? mine : null;
  let mode = null, game = null;
  if (mineLive) { mode = 'live'; game = mineLive; }
  else if (primeLive) { mode = 'live'; game = primeLive; }
  else if (live.length || (board && sunday && board.some(kickToday) && !mineFinal)) { mode = 'slate'; }
  else if (mineFinal) { mode = 'final'; game = mineFinal; }
  else if (!mineFinal && !board && lk && NOWMS - lk > 0 && NOWMS - lk < GAME_LEN + FINAL_WINDOW && NOWMS - lk > GAME_LEN) { mode = 'final'; game = null; }
  else if (nk && nk - NOWMS > 0 && nk - NOWMS < 30 * HOUR) { mode = 'preview'; }
  else if (data.status !== 'live' || !data.next) mode = 'offseason';
  else mode = 'between';
  if (f) { mode = f; if (f === 'live' && !game) game = mine || live[0] || (board && board[0]); if (f === 'final' && !game) game = mine; }
  return { mode, game, board, live };
}
const wantsMineFirst = (board, club) => board.slice().sort((a, b) => (involves(b, club) ? 1 : 0) - (involves(a, club) ? 1 : 0) || a.kick - b.kick);

// How soon to run again. nextKicks: every upcoming kickoff we know of (ms)
function refreshDate(data, ctx) {
  let at;
  const mineLive = ctx.mode === 'live' && ctx.game && involves(ctx.game, data.club.abbr);
  const anyLive = ctx.live && ctx.live.length;
  if (mineLive) at = NOWMS + 5 * MIN;
  else if (anyLive) at = NOWMS + 10 * MIN;
  else {
    const kicks = arr(data.slate).map((g) => Date.parse(g.kickoff)).concat(data.next ? [Date.parse(data.next.kickoff)] : [])
      .concat((ctx.board || []).map((g) => g.kick)).filter((k) => k > NOWMS + MIN).sort((a, b) => a - b);
    const morning = new Date(NOW); morning.setHours(7, 0, 0, 0);
    if (morning.getTime() <= NOWMS + MIN) morning.setDate(morning.getDate() + 1);
    at = morning.getTime();
    if (kicks.length && kicks[0] < at) at = kicks[0]; // wake at kickoff
    if (ctx.mode === 'final') at = Math.min(at, NOWMS + 60 * MIN);
    if (ctx.mode === 'slate') at = Math.min(at, NOWMS + 10 * MIN);
  }
  return new Date(at);
}

// ---------- live state helpers ----------
// The club's side, then the opponent's (the club first, whichever side it is)
function sides(g, club) {
  const mineAway = g.away.abbr === club;
  return { a: g.away, h: g.home, me: mineAway ? g.away : g.home, opp: mineAway ? g.home : g.away };
}
function quarterText(g) {
  if (g.state === 'post') return 'Final' + (g.period > 4 ? '/OT' : '');
  if (g.state === 'pre') return kickText(new Date(g.kick).toISOString());
  if (/half/i.test(g.desc) || /half/i.test(g.detail)) return 'Half';
  return (g.period > 4 ? 'OT' : 'Q' + g.period) + (g.clock ? ' · ' + g.clock : '');
}
const ordinal = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' })[n] || '';
function ddText(g) {
  const s = g.sit;
  if (!s || !s.down) return '';
  return `${ordinal(s.down)} & ${s.dist || 'Goal'}`;
}
// Field position as a fraction 0..1 from the possessing club's own goal line, and the spot's text
function fieldPos(g) {
  const s = g.sit;
  if (!s || !s.spot || !s.poss) return null;
  const own = s.spot.side === s.poss;
  const yd = own ? s.spot.yd : 100 - s.spot.yd; // yards from his own goal line
  return { yard: yd, frac: yd / 100, text: `${s.spot.side} ${s.spot.yd}`, first: Math.min(100, yd + (s.dist || 0)) };
}
// Leaders per club for the duel row: the summary's per-club leaders when there is one, else the scoreboard's game leaders
function clubLeaders(g, summary, byEspn) {
  const out = {};
  const take = (abbr, cat, l) => {
    const a = l.athlete || {};
    const rec = { cat, name: (a.displayName || a.shortName || '').trim(), short: a.shortName || '', id: a.id, jersey: a.jersey, pos: (a.position || {}).abbreviation,
      line: l.displayValue || '', value: l.value };
    (out[abbr] = out[abbr] || []).push(rec);
  };
  if (summary && arr(summary.leaders).length) {
    arr(summary.leaders).forEach((grp) => {
      const abbr = abbrOf((grp.team || {}).abbreviation);
      arr(grp.leaders).forEach((c) => arr(c.leaders).forEach((l) => take(abbr, c.name, l)));
    });
  } else {
    const idToAbbr = { [String(g.home.id)]: g.home.abbr, [String(g.away.id)]: g.away.abbr };
    g.leaders.forEach((c) => arr(c.leaders).forEach((l) => { const t = idToAbbr[String(((l.team || {}).id))]; if (t) take(t, c.name, l); }));
  }
  return out;
}
// "7 REC, 112 YDS, 1 TD" -> "7 rec · 112 yds · TD"; "21/26, 255 YDS, 3 TD" -> "21/26 · 255 yds · 3 TD"
function prettyLine(s) {
  return String(s).split(',').map((p) => p.trim()).map((p) => {
    if (/^1 TD$/i.test(p)) return 'TD';
    return p.replace(/\b(REC|YDS|CAR|TD|INT|SCK)\b/g, (m) => (m === 'TD' ? 'TD' : m.toLowerCase()));
  }).join(' · ');
}
// The hot hand: the best rushing / receiving leader (the QB stands on the turf)
function hotHand(list) {
  const pool = arr(list).filter((x) => /rushing|receiving/i.test(x.cat));
  return (pool.sort((a, b) => (b.value || 0) - (a.value || 0))[0]) || arr(list)[0] || null;
}
function boxStat(summary, abbr, name) {
  const t = arr(((summary || {}).boxscore || {}).teams).find((x) => abbrOf(x.team.abbreviation) === abbr);
  const s = t && arr(t.statistics).find((x) => x.name === name);
  return s ? s.displayValue : null;
}
const toSeconds = (t) => { const m = /^(\d+):(\d+)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
// Win probability series for the club: [0..1] each
function winSeries(summary, g, club) {
  const w = arr((summary || {}).winprobability);
  if (!w.length) return null;
  const home = g.home.abbr === club;
  return w.map((x) => (home ? x.homeWinPercentage : 1 - x.homeWinPercentage));
}
const lastPlayText = (g, summary) => {
  if (g.sit && g.sit.last) return g.sit.last;
  const sp = arr((summary || {}).scoringPlays);
  return sp.length ? sp[sp.length - 1].text : '';
};
const driveText = (summary) => {
  const cur = ((summary || {}).drives || {}).current;
  if (cur && cur.description) return cur.description;
  const prev = arr(((summary || {}).drives || {}).previous);
  return prev.length ? prev[prev.length - 1].description || '' : '';
};

// ---------- assets for a view ----------
async function loadAssets(data, abbrs, keys = [], kinds = ['fig']) {
  const art = data.art || {};
  const names = ['ball_1', 'clock_on', 'clock_off', 'firstdown_3', 'scoreboard_0', 'turf-day', 'turf-night'];
  const imgs = await Promise.all(names.map((n) => dataImage(art[n])));
  const A = { ball: imgs[0], clockOn: imgs[1], clockOff: imgs[2], fd: imgs[3], sb: imgs[4], turfDay: imgs[5], turfNight: imgs[6], logos: {}, crowd: {}, spr: {} };
  const uniq = [...new Set(abbrs.filter(Boolean))];
  await Promise.all(uniq.map(async (a) => { A.logos[a] = await logoImage(a); A.crowd[a] = await dataImage((art.crowd || {})[a]); }));
  A.stands = await dataImage((art.stands || {})[uniq[0] || data.club.abbr]);
  await Promise.all(keys.map(async (k) => {
    const p = (data.players || {})[k];
    if (!p) return;
    A.spr[k] = {};
    await Promise.all(kinds.map(async (kind) => { A.spr[k][kind] = await dataImage((p.sprites || {})[kind] || (kind !== 'fig' ? null : null)); }));
  }));
  return A;
}
const sprOf = (A, key, kind = 'fig') => (key && A.spr[key] && (A.spr[key][kind] || (kind === 'left' || kind === 'cheer' ? A.spr[key].fig : null))) || null;
const byEspnId = (data) => { const m = {}; Object.values(data.players || {}).forEach((p) => { if (p.espn) m[String(p.espn)] = p; }); return m; };
// A player the widget has a sprite for: the ESPN leader's athlete id -> our player
function playerFor(data, espnMap, leader) {
  return leader && leader.id ? espnMap[String(leader.id)] || null : null;
}
// The club's quarterback: ESPN's passing leader when we know him, else the club's top SZN quarterback
function qbFor(data, espnMap, leaders, abbr) {
  const pl = arr(leaders[abbr]).find((x) => /passing/i.test(x.cat));
  const p = playerFor(data, espnMap, pl);
  if (p) return p;
  const key = arr((data.top || {})[abbr]).find((k) => k.startsWith('QB:'));
  return key ? data.players[key] : null;
}

// ---------- pieces ----------
// The stage: the game's stands and crowd (each half in its club's colours) over its turf
function drawStage(dc, A, x, y, w, h, leftAbbr, rightAbbr, night) {
  const g = newCtx(w, h);
  R(g, 0, 0, w, h, new Color('#0a1020'));
  const turf = night ? A.turfNight : A.turfDay;
  if (turf) g.drawImageInRect(turf, new Rect(0, 54, w, h - 54));
  else R(g, 0, 54, w, h - 54, new Color('#2e6b2f'));
  const half = Math.ceil(w / 2);
  const crowdAt = 24;
  [[leftAbbr, 0], [rightAbbr, half]].forEach(([ab, hx]) => {
    // two tiles of the 320-point art cover the width; each half is cut from its own club's crowd
    const tile = newCtx(half, 33);
    if (A.crowd[ab]) { tile.drawImageInRect(A.crowd[ab], new Rect(-hx % 320 || 0, 0, 320, 33)); if (hx + half > 320) tile.drawImageInRect(A.crowd[ab], new Rect(320 - hx, 0, 320, 33)); }
    else R(tile, 0, 0, half, 33, new Color(mixHex('#0a1020', stripColor(ab), 0.4)));
    g.drawImageInRect(tile.getImage(), new Rect(hx, crowdAt, half, 33));
  });
  if (A.stands) {
    const st = newCtx(w, 28);
    st.drawImageInRect(A.stands, new Rect(0, 0, 320, 33));
    if (w > 320) st.drawImageInRect(A.stands, new Rect(320, 0, 320, 33));
    g.drawImageInRect(st.getImage(), new Rect(0, 0, w, 28));
  }
  R(g, 0, 0, w, 1, rgba('#ffffff', 0.0));
  // floodlights
  glow(g, w * 0.2, 0, w * 0.4, h * 0.7, '#fff8dc', 0.14);
  glow(g, w * 0.8, 0, w * 0.4, h * 0.7, '#fff8dc', 0.14);
  // rounded corners: the stage is a card
  const r = 12;
  drawRounded(dc, g.getImage(), x, y, w, h, r);
}
// Draw an image with rounded corners: DrawContext has no clip, so the four corners are patched with the colour behind
// them (BGFN)
function drawRounded(dc, img, x, y, w, h, r) {
  dc.drawImageInRect(img, new Rect(x, y, w, h));
  for (let i = 0; i < r; i++) {
    const d = r - Math.sqrt(Math.max(0, r * r - (r - i - 0.5) * (r - i - 0.5)));
    if (d <= 0) continue;
    [[x, y + i, 1, -1], [x + w - d, y + i, 1, 1], [x, y + h - i - 1, 1, -1], [x + w - d, y + h - i - 1, 1, 1]].forEach(([cx, cy], k) => {
      dc.setFillColor(new Color(BGFN(cx + d / 2, cy)));
      dc.fillRect(new Rect(cx, cy, d, 1.05));
    });
  }
}
let CORNER = '#0b1020';
// Score with a shadow
function scoreText(dc, n, x, y, w, size, color, align) {
  T(dc, n, x + 1.5, y + 1.5, w, size, { font: dispI(size), color: rgba('#000000', 0.5), align });
  T(dc, n, x, y, w, size, { font: dispI(size), color, align });
}
const LOSE = '#8f98b3';
function liveBadge(dc, xr, y, text, size = 11) {
  const w = estW(text, size) + 12;
  dc.setFillColor(C.live);
  dc.fillEllipse(new Rect(xr - w, y + size * 0.42, 6, 6));
  T(dc, text, xr - w + 9, y, w, size, { font: boldF(size), color: C.live });
}
function timeoutPips(dc, A, x, y, left, size = 8) {
  for (let i = 0; i < 3; i++) {
    const img = i < left ? A.clockOn : A.clockOff;
    if (img) dc.drawImageInRect(img, new Rect(x + i * (size + 2), y, size, size));
  }
}
// The field tracker: the possessing club's end zone on the left, drive in white, line of scrimmage in blue, first-down
// line in gold, the ball on the spot
function fieldTracker(dc, A, x, y, w, h, g, summary) {
  const sit = g.sit, fp = fieldPos(g);
  const t = newCtx(w, h);
  if (A.turfDay) t.drawImageInRect(A.turfDay, new Rect(0, -10, w, h + 20)); else R(t, 0, 0, w, h, new Color('#2e6b2f'));
  const ez = Math.round(w * 0.08);
  const offense = sit && sit.poss ? sit.poss : g.away.abbr;
  const defense = offense === g.home.abbr ? g.away.abbr : g.home.abbr;
  R(t, 0, 0, ez, h, new Color(primary(offense) === '#101820' ? secondary(offense) : primary(offense)));
  R(t, w - ez, 0, ez, h, new Color(primary(defense) === '#101820' ? secondary(defense) : primary(defense)));
  pixCenter(t, offense, ez / 2, h / 2 - 2.5 * 1.1, 1.1, '#ffffff');
  pixCenter(t, defense, w - ez / 2, h / 2 - 2.5 * 1.1, 1.1, '#ffffff');
  const field = w - 2 * ez;
  const px = (yd) => ez + field * (yd / 100);
  if (fp) {
    const dm = /(\d+)\s*yards?/i.exec(driveText(summary));
    const start = dm ? Math.max(0, fp.yard - +dm[1]) : null;
    if (start != null && fp.yard - start > 3) R(t, px(start), h * 0.44, px(fp.yard) - px(start), 4, rgba('#ffffff', 0.55));
    R(t, px(fp.first), 0, 2, h, new Color(HEX.gold));
    R(t, px(fp.yard) - 1, 0, 2, h, new Color('#4ea3ff'));
    if (A.ball) drawArt(t, A.ball, px(fp.yard) - 7, h * 0.3, 40, 20, 1);
  }
  drawRounded(dc, t.getImage(), x, y, w, h, 7);
}
// A pair of team bars: left value, a split bar, right value
function statBar(dc, x, y, w, leftText, rightText, frac, abbrL, abbrR) {
  const vw = 40;
  T(dc, leftText, x, y, vw - 4, 10.5, { font: boldF(10.5), align: 'right' });
  T(dc, rightText, x + w - vw + 4, y, vw - 4, 10.5, { font: boldF(10.5), align: 'left' });
  const bx = x + vw, bw = w - 2 * vw, f = Math.max(0.04, Math.min(0.96, frac));
  fillRounded(dc, bx, y + 3.5, bw, 6, 3, rgba('#ffffff', 0.12));
  fillRounded(dc, bx, y + 3.5, Math.max(6, bw * f), 6, 3, new Color(stripColor(abbrL)));
  fillRounded(dc, bx + bw * f, y + 3.5, Math.max(6, bw * (1 - f)), 6, 3, new Color(stripColor(abbrR) === stripColor(abbrL) ? secondary(abbrR) : stripColor(abbrR)));
}
// A sparkline of the win chance (the club's), 0..1
function sparkline(dc, x, y, w, h, series, hex) {
  fillRounded(dc, x, y, w, h, 7, rgba('#000000', 0.28));
  if (!series || series.length < 2) return;
  const n = Math.min(series.length, 60), step = (series.length - 1) / (n - 1);
  const p = new Path();
  for (let i = 0; i < n; i++) {
    const v = series[Math.round(i * step)];
    const pt = new Point(x + 4 + ((w - 8) * i) / (n - 1), y + 4 + (h - 8) * (1 - v));
    if (i) p.addLine(pt); else p.move(pt);
  }
  dc.setStrokeColor(new Color(hex)); dc.setLineWidth(1.6); dc.addPath(p); dc.strokePath();
  const half = new Path();
  half.move(new Point(x + 4, y + h / 2)); half.addLine(new Point(x + w - 4, y + h / 2));
  dc.setStrokeColor(rgba('#ffffff', 0.2)); dc.setLineWidth(0.6); dc.addPath(half); dc.strokePath();
}
// A hot-hand tile: bust on the outer edge, name strip and stat line aligned to it, nothing in the middle
function handTile(dc, A, data, x, y, w, side, abbr, hand, espnMap) {
  if (!hand) return;
  const pl = playerFor(data, espnMap, hand);
  const bust = bustImage(pl ? sprOf(A, pl.key, 'fig') : null, 32, abbr);
  const bx = side === 'left' ? x : x + w - 32;
  dc.drawImageInRect(bust, new Rect(bx, y, 32, 32));
  if (!pl) {
    T(dc, hand.jersey ? '#' + hand.jersey : (hand.short || '?')[0], bx, y + 9, 32, 14, { font: dispI(14), color: Color.white(), align: 'center' });
  }
  const tw = w - 32 - 7;
  const tx = side === 'left' ? x + 39 : x;
  const last = (hand.short || hand.name).split(' ').slice(-1)[0];
  nameStrip(dc, pl ? pl.last : last, side === 'left' ? tx : tx + tw, y, abbr, 12.5, side, tw);
  const lsz = fitSize(prettyLine(hand.line), tw, 10.5, 'sys', 8.5);
  T(dc, clip(prettyLine(hand.line), tw, lsz), tx, y + 19, tw, lsz, { font: bodyF(lsz), align: side === 'left' ? 'left' : 'right' });
}

// ---------- the live game, large (classic) ----------
async function liveLarge(data, ctx) {
  const sz = widgetSize('large');
  const g = ctx.game, club = data.club.abbr;
  const summary = ctx.summary;
  const espnMap = byEspnId(data);
  const leaders = clubLeaders(g, summary, espnMap);
  const L = g.away, Rr = g.home;
  const hands = { [L.abbr]: hotHand(leaders[L.abbr]), [Rr.abbr]: hotHand(leaders[Rr.abbr]) };
  const qbL = qbFor(data, espnMap, leaders, L.abbr), qbR = qbFor(data, espnMap, leaders, Rr.abbr);
  const keys = [qbL && qbL.key, qbR && qbR.key, ...[L, Rr].map((t) => { const p = playerFor(data, espnMap, hands[t.abbr]); return p && p.key; })].filter(Boolean);
  const A = await loadAssets(data, [L.abbr, Rr.abbr], keys, ['fig', 'left']);
  const dc = backgroundCtx(sz.w, sz.h, 'duo', L.abbr, Rr.abbr, [A.logos[L.abbr], A.logos[Rr.abbr]]);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  // kicker row
  pix(dc, `WEEK ${data.week}${g.venue ? ' · ' + clip(g.venue, 150, 6.7).toUpperCase() : ''}`, x0, y + 1, PX, HEX.gold);
  liveBadge(dc, x0 + cw, y - 2, quarterText(g), 11);
  y += 16;
  // team stats first: their count decides how tall the stage can be
  const ty = boxStat(summary, L.abbr, 'totalYards'), ty2 = boxStat(summary, Rr.abbr, 'totalYards');
  const tp = boxStat(summary, L.abbr, 'possessionTime'), tp2 = boxStat(summary, Rr.abbr, 'possessionTime');
  const td = boxStat(summary, L.abbr, 'thirdDownEff'), td2 = boxStat(summary, Rr.abbr, 'thirdDownEff');
  const series = winSeries(summary, g, involves(g, club) ? club : g.home.abbr);
  const nBars = [ty && ty2, tp && tp2 && toSeconds(tp) != null, td && td2].filter(Boolean).length;
  // stage
  const stageH = 112 + (3 - nBars) * 17;
  drawStage(dc, A, x0, y, cw, stageH, L.abbr, Rr.abbr, false);
  const lg = (ab, x) => { if (A.logos[ab]) dc.drawImageInRect(A.logos[ab], new Rect(x, y + 12, 26, 26)); };
  lg(L.abbr, x0 + cw * 0.25 - 13); lg(Rr.abbr, x0 + cw * 0.75 - 13);
  const spriteY = y + stageH - 5;
  if (qbL) drawSprite(dc, sprOf(A, qbL.key, 'fig'), x0 + cw * 0.11, spriteY, 3);
  if (qbR) drawSprite(dc, sprOf(A, qbR.key, 'left'), x0 + cw * 0.89, spriteY, 3);
  const sL = L.score == null ? 0 : L.score, sR = Rr.score == null ? 0 : Rr.score;
  scoreText(dc, sL, x0 + cw * 0.17, y + 46, cw * 0.2, 46, new Color(sL >= sR ? '#ffffff' : LOSE), 'center');
  scoreText(dc, sR, x0 + cw * 0.63, y + 46, cw * 0.2, 46, new Color(sR >= sL ? '#ffffff' : LOSE), 'center');
  T(dc, 'AT', x0 + cw * 0.46, y + 56, cw * 0.08, 11, { font: dispI(11), color: rgba('#ffffff', 0.75), align: 'center' });
  if (g.sit && g.sit.poss && A.ball) {
    const left = g.sit.poss === L.abbr;
    drawArt(dc, A.ball, left ? x0 + cw * 0.37 : x0 + cw * 0.83, y + 64, 40, 20, 2);
  }
  y += stageH + 4;
  // down & distance, drive
  const fp = fieldPos(g);
  const dd = ddText(g);
  T(dc, dd || (g.state === 'in' ? quarterText(g) : ''), x0, y, 150, 15, { font: dispI(15) });
  if (fp) T(dc, '· ' + fp.text, x0 + estW(dd, 15, 'cond') + 5, y + 1.5, 100, 12, { font: bodyF(12), color: C.dim });
  T(dc, driveText(summary), x0 + cw * 0.4, y + 2, cw * 0.6, 11, { font: bodyF(11), color: C.dim, align: 'right' });
  y += 19;
  fieldTracker(dc, A, x0, y, cw, 28, g, summary);
  y += 33;
  // the hot hands, left player left, right player right, nothing between them
  fillRounded(dc, x0, y, cw, 44, 10, rgba('#080c1a', 0.62));
  handTile(dc, A, data, x0 + 7, y + 6, cw / 2 - 14, 'left', L.abbr, hands[L.abbr], espnMap);
  handTile(dc, A, data, x0 + cw / 2 + 7, y + 6, cw / 2 - 14, 'right', Rr.abbr, hands[Rr.abbr], espnMap);
  y += 50;
  // team stats
  const rowsData = [
    ty && ty2 ? [ty, ty2, +ty / Math.max(1, +ty + +ty2)] : null,
    tp && tp2 && toSeconds(tp) != null ? [tp, tp2, toSeconds(tp) / Math.max(1, toSeconds(tp) + toSeconds(tp2))] : null,
    td && td2 ? [td.replace('-', '/'), td2.replace('-', '/'), (() => { const a = td.split('-'), b = td2.split('-'); return (+a[0] / Math.max(1, +a[1])) / Math.max(0.01, (+a[0] / Math.max(1, +a[1])) + (+b[0] / Math.max(1, +b[1]))); })()] : null,
  ].filter(Boolean);
  rowsData.forEach((r) => { statBar(dc, x0 + 6, y, cw - 12, r[0], r[1], isNaN(r[2]) ? 0.5 : r[2], L.abbr, Rr.abbr); y += 17; });
  y += 3;
  // last play
  const lp = lastPlayText(g, summary);
  if (lp) {
    fillRounded(dc, x0, y, cw, 20, 8, rgba('#080c1a', 0.55));
    const kw = pix(dc, 'LAST PLAY', x0 + 8, y + 7.5, 1.1, HEX.dim);
    T(dc, clip(lp, cw - kw - 22, 10.5), x0 + 8 + kw + 6, y + 3.5, cw - kw - 20, 10.5, { font: bodyF(10.5) });
  }
  y += 24;
  // win chance and timeouts
  const me = g.home.abbr === club || g.away.abbr === club ? club : g.home.abbr;
  const stripH = 28;
  if (series) sparkline(dc, x0, y, cw * 0.62, stripH, series, stripColor(me) === '#101820' ? secondary(me) : mixHex(stripColor(me), '#ffffff', 0.35));
  const wp = series ? series[series.length - 1] : null;
  if (wp != null && series) T(dc, `${me} ${Math.round(wp * 100)}%`, x0 + 6, y + 3, 100, 10, { font: boldF(10), color: C.chalk });
  const tx = series ? x0 + cw * 0.62 + 10 : x0;
  const to = (ab, n, yy) => { T(dc, ab, tx, yy, 30, 9.5, { font: boldF(9.5), color: C.dim }); timeoutPips(dc, A, tx + 34, yy + 1, n == null ? 3 : n); };
  to(L.abbr, g.sit && g.sit.awayTO, y + 2);
  to(Rr.abbr, g.sit && g.sit.homeTO, y + 15);
  y += stripH + 6;
  pix(dc, series ? `WIN CHANCE · TIMEOUTS` : 'TIMEOUTS', x0, sz.h - PAD.bottom - 7, 0.95, '#6d7896');
  pixRight(dc, `UPDATED ${clockAmPm(NOW)}`, x0 + cw, sz.h - PAD.bottom - 7, 0.95, '#6d7896');
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}

// ---------- the broadcast score bug (the game's pixels: its football, timeout clocks and first-down ref) ----------
// One horizontal bug: both clubs in their colours with a pixel bevel, the quarter and clock, down and distance in yellow
function bugBlock(dc, A, x, y, w, h, t, g, hasBall, big) {
  R(dc, x, y, w, h, new Color(stripColor(t.abbr)));
  R(dc, x, y, w, 1.4, rgba('#ffffff', 0.28));
  R(dc, x, y + h - 1.4, w, 1.4, rgba('#000000', 0.35));
  const ls = big ? 21 : 18;
  if (A.logos[t.abbr]) dc.drawImageInRect(A.logos[t.abbr], new Rect(x + 4, y + (h - ls) / 2 - 3, ls, ls));
  pix(dc, t.abbr, x + 6 + ls, y + h / 2 - 9, 1.33, '#ffffff', true);
  pixRight(dc, String(t.score == null ? 0 : t.score), x + w - 7, y + h / 2 - 9.5, 2.67, '#ffffff', true);
  if (hasBall && A.ball) drawArt(dc, A.ball, x + w - 17, y + 2.5, 40, 20, 1);
  return ls;
}
function drawBug(dc, A, x, y, w, g, opts = {}) {
  const h = 38;
  fillRounded(dc, x - 4, y - 4, w + 8, h + 8, 5, new Color('#0b0d16'));
  fillRounded(dc, x - 2, y - 2, w + 4, h + 4, 3.5, new Color('#f4f4f4'));
  fillRounded(dc, x, y, w, h, 2, new Color('#141826'));
  const clockW = 54, dnW = opts.noDown ? 0 : 80;
  const tw = (w - clockW - dnW) / 2;
  const poss = g.sit && g.sit.poss;
  [g.away, g.home].forEach((t, i) => {
    const bx = x + i * tw;
    bugBlock(dc, A, bx, y, tw, h, t, g, poss === t.abbr, true);
    const n = i === 0 ? g.sit && g.sit.awayTO : g.sit && g.sit.homeTO;
    timeoutPips(dc, A, bx + 28, y + h - 11, n == null ? 3 : n, 7);
    if (i === 0) R(dc, bx + tw - 1, y, 2, h, new Color('#0b0d16'));
  });
  const cx = x + 2 * tw;
  R(dc, cx, y, clockW, h, new Color('#20263a'));
  R(dc, cx, y, 2, h, new Color('#0b0d16'));
  R(dc, cx, y, clockW, 1.4, rgba('#ffffff', 0.2));
  const q = g.state === 'post' ? 'FINAL' : g.period > 4 ? 'OT' : ['', '1ST', '2ND', '3RD', '4TH'][g.period] || '';
  pixCenter(dc, q, cx + clockW / 2, y + 9, 1.33, '#ffffff');
  pixCenter(dc, g.clock || '', cx + clockW / 2, y + 22, 1.33, '#ffb84a');
  if (!opts.noDown) {
    const dx = x + w - dnW;
    R(dc, dx, y, dnW, h, new Color('#ffd84a'));
    R(dc, dx, y, 2, h, new Color('#0b0d16'));
    R(dc, dx, y, dnW, 1.4, rgba('#ffffff', 0.4));
    if (A.fd) drawArt(dc, A.fd, dx + 5, y + h / 2 - 6.5, 20, 20, 2);
    const txt = (ddText(g) || (g.state === 'post' ? 'FINAL' : '')).toUpperCase().replace('&', '&');
    pix(dc, txt, dx + 21, y + h / 2 - 3.3, 1.33, '#1a1400');
  }
}
// Stacked bug for the small widget: both clubs, the quarter, down and distance
function drawBugStack(dc, A, x, y, w, g) {
  const rowH = 26;
  fillRounded(dc, x - 4, y - 4, w + 8, rowH * 2 + 20 + 22 + 8, 5, new Color('#0b0d16'));
  fillRounded(dc, x - 2, y - 2, w + 4, rowH * 2 + 20 + 22 + 4, 3.5, new Color('#f4f4f4'));
  const poss = g.sit && g.sit.poss;
  [g.away, g.home].forEach((t, i) => {
    const by = y + i * rowH;
    R(dc, x, by, w, rowH, new Color(stripColor(t.abbr)));
    R(dc, x, by, w, 1.4, rgba('#ffffff', 0.28));
    R(dc, x, by + rowH - 1.4, w, 1.4, rgba('#000000', 0.35));
    if (A.logos[t.abbr]) dc.drawImageInRect(A.logos[t.abbr], new Rect(x + 3, by + 3, 17, 17));
    pix(dc, t.abbr, x + 24, by + 5, 1.33, '#ffffff', true);
    const n = i === 0 ? g.sit && g.sit.awayTO : g.sit && g.sit.homeTO;
    timeoutPips(dc, A, x + 24, by + rowH - 9.5, n == null ? 3 : n, 6.5);
    pixRight(dc, String(t.score == null ? 0 : t.score), x + w - 6, by + 5, 2.67, '#ffffff', true);
    if (poss === t.abbr && A.ball) drawArt(dc, A.ball, x + w - 35, by + 3, 40, 20, 1);
  });
  const cy = y + rowH * 2;
  R(dc, x, cy, w, 20, new Color('#20263a'));
  const q = g.period > 4 ? 'OT' : ['', '1ST', '2ND', '3RD', '4TH'][g.period] || '';
  pixCenter(dc, `${q} ${g.clock || ''}`.trim(), x + w / 2, cy + 7.5, 1.33, '#ffb84a');
  const yy = cy + 20;
  R(dc, x, yy, w, 22, new Color('#ffd84a'));
  if (A.fd) drawArt(dc, A.fd, x + 4, yy + 4.5, 20, 20, 2);
  const fp = fieldPos(g);
  pix(dc, `${ddText(g)}${fp ? ' · ' + fp.text : ''}`.toUpperCase(), x + 20, yy + 8, 1.2, '#1a1400');
}
function chipLabel(dc, text, x, y, bg, fg = '#ffffff', px = 1.1) {
  const w = pixW(text) * px + 10;
  fillRounded(dc, x, y, w, 5 * px + 8, 4, rgba(bg, 0.8));
  pix(dc, text, x + 5, y + 4, px, fg);
  return w;
}
// The broadcast shot: a scrimmage on the turf, the line of scrimmage (blue) and the first-down line (gold)
function drawCamera(dc, A, x, y, w, h, g, figs, opts = {}) {
  const c = newCtx(w, h);
  if (opts.crowd) {
    c.drawImageInRect(A.turfDay || A.turfNight, new Rect(0, 52, w, h - 52));
    const half = Math.ceil(w / 2);
    [[g.away.abbr, 0], [g.home.abbr, half]].forEach(([ab, hx]) => {
      const tile = newCtx(half, 33);
      if (A.crowd[ab]) { tile.drawImageInRect(A.crowd[ab], new Rect(-hx % 320 || 0, 0, 320, 33)); if (hx + half > 320) tile.drawImageInRect(A.crowd[ab], new Rect(320 - hx, 0, 320, 33)); }
      c.drawImageInRect(tile.getImage(), new Rect(hx, 22, half, 33));
    });
    if (A.stands) { const st = newCtx(w, 28); st.drawImageInRect(A.stands, new Rect(0, 0, 320, 33)); if (w > 320) st.drawImageInRect(A.stands, new Rect(320, 0, 320, 33)); c.drawImageInRect(st.getImage(), new Rect(0, 0, w, 28)); }
  } else if (A.turfDay) c.drawImageInRect(A.turfDay, new Rect(0, -6, w, h + 12));
  else R(c, 0, 0, w, h, new Color('#2e6b2f'));
  const top = opts.crowd ? 52 : 0;
  const los = w * 0.46, fd = w * 0.6;
  R(c, los, top, 2, h - top, rgba('#4ea3ff', 0.85));
  R(c, fd, top, 2, h - top, rgba(HEX.gold, 0.85));
  const feet = h - 8;
  figs.forEach((f) => { if (f.img) drawSprite(c, f.img, w * f.at, feet - (f.dy || 0), f.k || 3); });
  drawRounded(dc, c.getImage(), x, y, w, h, 10);
}
const fdChip = (g) => { const f = fieldPos(g); return `${ddText(g) || quarterText(g)}${f ? ' · ' + f.text : ''}`.toUpperCase(); };

// A bust-sized sprite from a club's QB at a position
async function figsFor(data, A, g, espnMap, leaders) {
  return null;
}

// ---------- live: the broadcast bug, large ("the TV picture") ----------
async function liveLargeBug(data, ctx) {
  const sz = widgetSize('large');
  const g = ctx.game, summary = ctx.summary;
  const espnMap = byEspnId(data), leaders = clubLeaders(g, summary, espnMap);
  const off = (g.sit && g.sit.poss) || g.away.abbr, def = off === g.home.abbr ? g.away.abbr : g.home.abbr;
  const offQb = qbFor(data, espnMap, leaders, off);
  const hand = (ab) => playerFor(data, espnMap, hotHand(leaders[ab]));
  const hOff = hand(off), hDef = hand(def);
  const keys = [offQb, hOff, hDef].filter(Boolean).map((p) => p.key);
  const A = await loadAssets(data, [g.away.abbr, g.home.abbr], keys, ['fig', 'left']);
  const dc = backgroundCtx(sz.w, sz.h, 'duo', g.away.abbr, g.home.abbr, [A.logos[g.away.abbr], A.logos[g.home.abbr]]);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  pix(dc, `WEEK ${data.week}${g.venue ? ' · ' + clip(g.venue, 150, 6.7).toUpperCase() : ''}`, x0, y + 1, PX, HEX.gold);
  liveBadge(dc, x0 + cw, y - 2, 'Live', 11);
  y += 17;
  const camH = 128;
  drawCamera(dc, A, x0, y, cw, camH, g, [
    hOff && { img: sprOf(A, hOff.key, 'fig'), at: 0.2 }, offQb && { img: sprOf(A, offQb.key, 'fig'), at: 0.4 },
    hDef && { img: sprOf(A, hDef.key, 'left'), at: 0.74 },
  ].filter(Boolean), { crowd: true });
  chipLabel(dc, fdChip(g), x0 + 8, y + 8, '#000000', '#ffffff', 1.1);
  const fp = fieldPos(g);
  if (fp && fp.yard >= 75) chipLabel(dc, 'RED ZONE', x0 + cw - 70, y + 8, '#d93b3b', '#ffffff', 1.1);
  y += camH + 14;
  drawBug(dc, A, x0 + 4, y, cw - 8, g);
  y += 38 + 14;
  // the line score in the game's scoreboard frame, a performer line under each club
  lineScore(dc, A, x0 + (cw - 277) / 2, y, g, leaders);
  const wc = winChance(ctx, g, data.club.abbr);
  const me = involves(g, data.club.abbr) ? data.club.abbr : g.home.abbr;
  pix(dc, wc ? `WIN CHANCE ${me} ${Math.round(wc.p * 100)}%` : 'WIN CHANCE', x0, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  pixRight(dc, `UPDATED ${clockAmPm(NOW)}`, x0 + cw, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
const SB_K = 4; // device pixels per art pixel: the frame is stored 4x, so 4 draws every pixel whole
function lineScore(dc, A, x, y, g, leaders) {
  const W = 208 / 3 * SB_K * 0.75 * 1, H = 88 / 3 * SB_K * 0.75; // 208 x 88 art pixels at 4 device px = 277 x 117 pt
  const w = 208 * SB_K / SCALE, h = 88 * SB_K / SCALE;
  R(dc, x, y, w, h, new Color('#141826'));
  if (A.sb) dc.drawImageInRect(A.sb, new Rect(x, y, w, h));
  const sx = (px) => x + (px / 208) * w, sy = (py) => y + (py / 88) * h;
  const rows = [[g.away, 2.27, 32.95], [g.home, 51.14, 81.82]];
  rows.forEach(([t, top, strip]) => {
    const ry = y + (top / 100) * h, rh = 0.2841 * h;
    if (A.logos[t.abbr]) dc.drawImageInRect(A.logos[t.abbr], new Rect(x + 8, ry + rh / 2 - 9, 18, 18));
    T(dc, t.abbr, x + 30, ry + rh / 2 - 7, 50, 13, { font: disp(13) });
    const cols = [30.77, 42.79, 54.81, 66.83].map((c) => x + (c / 100) * w);
    cols.forEach((cx, i) => T(dc, t.ls[i] != null ? t.ls[i] : '-', cx, ry + rh / 2 - 7, 0.1202 * w, 13, { font: boldF(12), align: 'center' }));
    T(dc, t.score == null ? 0 : t.score, x + 0.7885 * w, ry + rh / 2 - 10, 0.2019 * w, 20, { font: dispI(20), color: new Color(inkOf(t.abbr)), align: 'center' });
    const lead = arr(leaders[t.abbr]).find((l) => /passing/i.test(l.cat)) || arr(leaders[t.abbr])[0];
    if (lead) {
      const nm = (lead.short || lead.name).split(' ').slice(-1)[0];
      T(dc, clip(`${nm} ${prettyLine(lead.line)}`.toUpperCase(), w - 12, 8.5), x + 7, y + (strip / 100) * h + 3, w - 12, 8.5, { font: boldF(8.5), color: new Color('#c9d0e4') });
    }
  });
}

// ---------- live: medium ----------
const tickStyle = (names) => {
  if (FORCE.style && names.includes(FORCE.style)) return FORCE.style;
  const m = /\b(bug|classic)\b/i.exec(PARAM);
  if (m && names.includes(m[1].toLowerCase())) return m[1].toLowerCase();
  return names[Math.floor(NOWMS / (15 * MIN)) % names.length];
};
function winChance(ctx, g, club) {
  const s = winSeries(ctx.summary, g, g.home.abbr === club || g.away.abbr === club ? club : g.home.abbr);
  return s ? { p: s[s.length - 1], series: s } : null;
}
async function liveCommon(data, ctx, kinds = ['fig', 'left', 'cheer']) {
  const g = ctx.game, espnMap = byEspnId(data), leaders = clubLeaders(g, ctx.summary, espnMap);
  const ab = [g.away.abbr, g.home.abbr];
  const off = (g.sit && g.sit.poss) || g.away.abbr;
  const qbs = ab.map((a) => qbFor(data, espnMap, leaders, a));
  const hands = ab.map((a) => playerFor(data, espnMap, hotHand(leaders[a])));
  const handRaw = ab.map((a) => hotHand(leaders[a]));
  const keys = [...qbs, ...hands].filter(Boolean).map((p) => p.key);
  const A = await loadAssets(data, ab, keys, kinds);
  return { g, A, espnMap, leaders, ab, off, qbs, hands, handRaw };
}
// "CIN @ WAS" kicker + the live badge
function liveHead(dc, x, y, w, g, data, short) {
  pix(dc, `${g.away.abbr} @ ${g.home.abbr}`, x, y + 1, PX, HEX.gold);
  liveBadge(dc, x + w, y - 2, quarterText(g), 11);
}
async function liveMedium(data, ctx) {
  const sz = widgetSize('medium');
  const style = tickStyle(['classic', 'shot', 'bug']);
  const L = await liveCommon(data, ctx);
  const { g, A } = L;
  const club = data.club.abbr;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', g.away.abbr, g.home.abbr, [A.logos[g.away.abbr], A.logos[g.home.abbr]]);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side, y0 = PAD.top;
  const wc = winChance(ctx, g, club);
  const me = involves(g, club) ? club : g.home.abbr;
  if (style === 'classic') {
    const rw = 104, lw = cw - rw - 8;
    // the hot hand celebrating on the right
    const hot = L.hands.slice().sort((a, b) => 0)[0];
    const pick = (L.handRaw[0] && L.handRaw[0].value || 0) >= (L.handRaw[1] && L.handRaw[1].value || 0) ? 0 : 1;
    const hp = L.hands[pick] || L.hands[1 - pick], hr = L.handRaw[pick] || L.handRaw[1 - pick], hab = L.ab[pick];
    const px = x0 + lw + 8, ph = sz.h - PAD.top - PAD.bottom;
    drawStage(dc, A, px, y0, rw, ph, hab, hab, false);
    if (hp) drawSprite(dc, sprOf(A, hp.key, 'cheer'), px + rw / 2, y0 + ph - 22, 3);
    fillRounded(dc, px + 5, y0 + ph - 30, rw - 10, 26, 7, rgba('#080c1a', 0.72));
    if (hr) {
      nameStrip(dc, hp ? hp.last : (hr.short || '').split(' ').slice(-1)[0], px + rw / 2, y0 + ph - 29, hab, 10, 'center', rw - 14);
      T(dc, clip(prettyLine(hr.line).split(' · ').slice(1).join(' · ') || prettyLine(hr.line), rw - 14, 9.5), px + 7, y0 + ph - 14.5, rw - 14, 9.5, { font: boldF(9.5), align: 'center' });
    }
    // left: heads, scores, down and distance, tracker, last play
    liveHead(dc, x0, y0, lw, g, data);
    let y = y0 + 18;
    const sL = g.away.score || 0, sR = g.home.score || 0;
    if (A.logos[g.away.abbr]) dc.drawImageInRect(A.logos[g.away.abbr], new Rect(x0, y + 4, 28, 28));
    scoreText(dc, sL, x0 + 30, y, 60, 38, new Color(sL >= sR ? '#ffffff' : LOSE), 'left');
    if (g.sit && g.sit.poss === g.away.abbr && A.ball) drawArt(dc, A.ball, x0 + 30 + estW(String(sL), 38, 'cond') + 2, y + 16, 40, 20, 2);
    if (A.logos[g.home.abbr]) dc.drawImageInRect(A.logos[g.home.abbr], new Rect(x0 + lw - 28, y + 4, 28, 28));
    scoreText(dc, sR, x0 + lw - 92, y, 60, 38, new Color(sR >= sL ? '#ffffff' : LOSE), 'right');
    if (g.sit && g.sit.poss === g.home.abbr && A.ball) drawArt(dc, A.ball, x0 + lw - 92 - 30, y + 16, 40, 20, 2);
    y += 40;
    const fp = fieldPos(g), dd = ddText(g);
    T(dc, dd, x0, y, 90, 13, { font: dispI(13) });
    if (fp) T(dc, '· ' + fp.text, x0 + estW(dd, 13, 'cond') + 4, y + 1, 70, 11, { font: bodyF(11), color: C.dim });
    if (wc) T(dc, `Win ${me} ${Math.round((me === club || me === g.home.abbr ? wc.p : wc.p) * 100)}%`, x0 + lw - 90, y + 1, 90, 11, { font: bodyF(11), color: C.dim, align: 'right' });
    y += 17;
    fieldTracker(dc, A, x0, y, lw, 22, g, ctx.summary);
    y += 27;
    const lp = lastPlayText(g, ctx.summary);
    fillRounded(dc, x0, y, lw, 21, 8, rgba('#080c1a', 0.58));
    const kw = pix(dc, 'LAST PLAY', x0 + 7, y + 8, 1, HEX.dim);
    T(dc, clip(lp, lw - kw - 22, 10), x0 + 7 + kw + 5, y + 4.5, lw - kw - 16, 10, { font: bodyF(10) });
  } else if (style === 'shot') {
    const camH = 88;
    drawCamera(dc, A, x0, y0, cw, camH, g, [
      L.hands[0] && { img: sprOf(A, L.hands[0].key, 'fig'), at: 0.16, k: 3 }, L.qbs[0] && { img: sprOf(A, L.qbs[0].key, 'fig'), at: 0.36, k: 3 },
      L.hands[1] && { img: sprOf(A, L.hands[1].key, 'left'), at: 0.7, k: 3 },
    ].filter(Boolean), {});
    chipLabel(dc, fieldPos(g) ? fieldPos(g).text : quarterText(g), x0 + cw - 62, y0 + 6, '#000000', '#ffffff', 1.05);
    drawBug(dc, A, x0 + 4, y0 + camH + 14, cw - 8, g);
  } else {
    liveHead(dc, x0, y0, cw, g, data);
    drawBug(dc, A, x0 + 4, y0 + 22, cw - 8, g);
    const y = y0 + 22 + 38 + 12;
    const half = (cw - 8) / 2 - 3;
    const fp = fieldPos(g);
    fillRounded(dc, x0 + 2, y, half + 20, 20, 3, rgba('#0b0d16', 0.85));
    pix(dc, `${fp ? fp.text : quarterText(g)}${g.sit && g.sit.poss ? ' · ' + g.sit.poss + ' BALL' : ''}`.toUpperCase(), x0 + 9, y + 7.2, 1.2, '#ffffff');
    fillRounded(dc, x0 + 2 + half + 24, y, half - 4, 20, 3, rgba('#0b0d16', 0.85));
    pix(dc, wc ? `WIN ${me} ${Math.round(wc.p * 100)}%` : quarterText(g), x0 + 2 + half + 31, y + 7.2, 1.2, '#ffffff');
    if (g.sit && g.sit.redZone) { fillRounded(dc, x0 + cw - 44, y, 42, 20, 3, new Color('#ffcc00')); pix(dc, 'FLAG', x0 + cw - 38, y + 7.2, 1.2, '#1a1400'); }
    const lp = lastPlayText(g, ctx.summary), dr = driveText(ctx.summary);
    const ly = y + 27;
    const kw = pix(dc, 'LAST PLAY', x0 + 2, ly + 3, 1, HEX.dim);
    T(dc, clip(lp, cw - kw - 12, 10), x0 + 2 + kw + 6, ly, cw - kw - 12, 10, { font: bodyF(10) });
    if (dr) { const dw = pix(dc, 'DRIVE', x0 + 2, ly + 17, 1, HEX.dim); T(dc, clip(dr, cw - dw - 12, 10), x0 + 2 + dw + 6, ly + 14, cw - dw - 12, 10, { font: bodyF(10), color: C.dim }); }
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
// ---------- live: small ----------
async function liveSmall(data, ctx) {
  const sz = widgetSize('small');
  const style = tickStyle(['live', 'bug', 'duel']);
  const L = await liveCommon(data, ctx, ['fig', 'left']);
  const { g, A } = L;
  const club = data.club.abbr;
  const me = involves(g, club) ? club : g.home.abbr;
  const wc = winChance(ctx, g, club);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side, y0 = PAD.top;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', g.away.abbr, g.home.abbr, [A.logos[g.away.abbr], A.logos[g.home.abbr]]);
  CORNER = '#0b1020';
  if (style === 'live') {
    dc.setFillColor(C.live);
    dc.fillEllipse(new Rect(x0, y0 + 2, 6, 6));
    T(dc, quarterText(g), x0 + 10, y0 - 2, cw, 11, { font: boldF(11), color: C.live });
    let y = y0 + 15;
    [g.away, g.home].forEach((t, i) => {
      const other = i === 0 ? g.home : g.away;
      const sc = t.score || 0;
      if (A.logos[t.abbr]) dc.drawImageInRect(A.logos[t.abbr], new Rect(x0, y + 2, 28, 28));
      scoreText(dc, sc, x0 + 34, y - 2, 60, 36, new Color(sc >= (other.score || 0) ? '#ffffff' : LOSE), 'left');
      if (g.sit && g.sit.poss === t.abbr && A.ball) drawArt(dc, A.ball, x0 + 36 + estW(String(sc), 36, 'cond'), y + 12, 40, 20, 2);
      y += 36;
    });
    const fp = fieldPos(g), dd = ddText(g);
    T(dc, dd, x0, y + 1, cw, 13, { font: dispI(13) });
    if (fp) T(dc, '· ' + fp.text, x0 + estW(dd, 13, 'cond') + 4, y + 2.5, 70, 11, { font: bodyF(11), color: C.dim });
    y += 20;
    if (wc) {
      fillRounded(dc, x0, y, cw, 7, 3.5, rgba('#ffffff', 0.14));
      fillRounded(dc, x0, y, Math.max(7, cw * wc.p), 7, 3.5, new Color(me === g.home.abbr ? stripColor(me) : stripColor(me)));
      T(dc, `Win ${me} ${Math.round(wc.p * 100)}%`, x0, y + 10, cw, 10, { font: bodyF(10), color: C.dim });
    }
    const toL = g.sit && (g.home.abbr === club ? g.sit.homeTO : g.sit.awayTO), toR = g.sit && (g.home.abbr === club ? g.sit.awayTO : g.sit.homeTO);
    if (toL != null) T(dc, `TO ${toL}-${toR}`, x0, y + 10, cw, 10, { font: bodyF(10), color: C.dim, align: 'right' });
  } else if (style === 'bug') {
    pix(dc, `WEEK ${data.week}`, x0, y0, PX, HEX.gold);
    drawBugStack(dc, A, x0 + 4, y0 + 18, cw - 8, g);
    if (wc) pixCenter(dc, `WIN ${me} ${Math.round(wc.p * 100)}%`, x0 + cw / 2, sz.h - PAD.bottom - 8, 1, '#8f98b3');
  } else {
    const sh = sz.h - PAD.top - PAD.bottom;
    drawStage(dc, A, x0, y0, cw, sh - 30, g.away.abbr, g.home.abbr, false);
    const feet = y0 + sh - 30 - 4;
    if (L.qbs[0]) drawSprite(dc, sprOf(A, L.qbs[0].key, 'fig'), x0 + cw * 0.2, feet, 2);
    if (L.qbs[1]) drawSprite(dc, sprOf(A, L.qbs[1].key, 'left'), x0 + cw * 0.8, feet, 2);
    const by = y0 + sh - 22;
    const sL = g.away.score || 0, sR = g.home.score || 0;
    T(dc, sL, x0 + 2, by - 6, 50, 24, { font: dispI(24), color: new Color(sL >= sR ? '#ffffff' : LOSE) });
    T(dc, sR, x0 + cw - 52, by - 6, 50, 24, { font: dispI(24), color: new Color(sR >= sL ? '#ffffff' : LOSE), align: 'right' });
    liveBadge(dc, sz.w / 2 + 11, by - 2, 'Q' + g.period, 10);
    const ln = (p, ab) => (p ? p.last : '');
    pixCenter(dc, `${ln(L.qbs[0])} VS ${ln(L.qbs[1])}`.toUpperCase(), sz.w / 2, sz.h - PAD.bottom - 8, 0.95, '#c9d0e4');
    // crowd tint strip behind the lower text
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}

// ---------- slate and ticker ----------
function oddsFavourite(g) {
  const m = /^([A-Z]{2,3})\s+-(\d+(?:\.\d)?)/.exec(g.odds || '');
  return m ? { abbr: abbrOf(m[1]), spread: +m[2] } : null;
}
function flagOf(g) {
  if (g.state === 'in') {
    if (g.sit && g.sit.redZone) return ['RED ZONE', HEX.live];
    const fav = oddsFavourite(g);
    if (fav && fav.spread >= 6) { const t = g.home.abbr === fav.abbr ? g.home : g.away, o = t === g.home ? g.away : g.home; if ((t.score || 0) < (o.score || 0)) return ['UPSET?', HEX.live]; }
    if (g.period >= 4 && Math.abs((g.home.score || 0) - (g.away.score || 0)) <= 8) return ['CLOSE', HEX.gold];
  }
  if (g.state === 'post') {
    const fav = oddsFavourite(g);
    if (fav && fav.spread >= 6) { const t = g.home.abbr === fav.abbr ? g.home : g.away, o = t === g.home ? g.away : g.home; if ((t.score || 0) < (o.score || 0)) return ['UPSET', HEX.live]; }
  }
  return null;
}
const statusLine = (g) => (g.state === 'pre' ? clockAmPm(new Date(g.kick)).replace(/ [AP]M/, '') : quarterText(g));
function slateOrder(board, club) {
  const rank = (g) => (involves(g, club) ? 0 : g.state === 'in' ? 1 : g.state === 'pre' ? 2 : 3);
  return board.slice().sort((a, b) => rank(a) - rank(b) || a.kick - b.kick);
}
// A two-row game cell: logos, abbreviations, scores, status and flag
function gameCell(dc, A, x, y, w, h, g, club, opts = {}) {
  const mine = involves(g, club);
  fillRounded(dc, x, y, w, h, 9, rgba('#080c1a', 0.62));
  if (mine) strokeRounded(dc, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 8.5, 1.5, new Color(HEX.live));
  const rowH = opts.rowH || 17;
  [g.away, g.home].forEach((t, i) => {
    const ry = y + 5 + i * rowH;
    const o = i === 0 ? g.home : g.away;
    const lose = g.state !== 'pre' && (t.score || 0) < (o.score || 0);
    if (A.logos[t.abbr]) dc.drawImageInRect(A.logos[t.abbr], new Rect(x + 7, ry, 15, 15));
    T(dc, t.abbr, x + 26, ry - 0.5, 40, 12.5, { font: semiF(12.5), color: lose ? new Color('#7f88a4') : C.chalk });
    if (g.state !== 'pre') T(dc, t.score == null ? '' : t.score, x + w - (opts.scoreInset || 8) - 40, ry - 2, 40, 17, { font: disp(17), color: lose ? new Color('#7f88a4') : C.chalk, align: 'right' });
  });
  if (opts.status !== false) {
    const sy = y + 5 + 2 * rowH + 1;
    T(dc, statusLine(g), x + 7, sy, w * 0.5, 9.5, { font: bodyF(9.5), color: g.state === 'in' ? C.dim : C.dim });
    const fl = flagOf(g);
    if (fl) T(dc, fl[0], x + w - 8 - w * 0.4, sy, w * 0.4, 9.5, { font: boldF(9.5), color: new Color(fl[1]), align: 'right' });
    else if (g.state === 'in') T(dc, g.sit && g.sit.poss ? g.sit.poss + ' ball' : '', x + w - 8 - w * 0.4, sy, w * 0.4, 9.5, { font: bodyF(9.5), color: C.dim, align: 'right' });
  }
}
// The bottom-line ticker bar: the logo chip, then compact scores in turn
function tickerBar(dc, A, x, y, w, h, games, label) {
  fillRounded(dc, x, y, w, h, 7, rgba('#05070f', 0.85));
  fillRounded(dc, x, y, 36, h, 7, new Color(HEX.gold));
  T(dc, label || 'RV', x, y + (h - 14) / 2 - 0.5, 36, 14, { font: dispI(14), color: new Color('#1a1400'), align: 'center' });
  let cx = x + 44;
  for (const g of games) {
    const live = g.state !== 'pre';
    const need = live ? 76 : 80;
    if (cx + need > x + w - 4) break;
    if (live) {
      if (A.logos[g.away.abbr]) dc.drawImageInRect(A.logos[g.away.abbr], new Rect(cx, y + (h - 13) / 2, 13, 13));
      T(dc, g.away.score || 0, cx + 15, y + (h - 14) / 2 - 1, 22, 14, { font: disp(14) });
      if (A.logos[g.home.abbr]) dc.drawImageInRect(A.logos[g.home.abbr], new Rect(cx + 36, y + (h - 13) / 2, 13, 13));
      T(dc, g.home.score || 0, cx + 51, y + (h - 14) / 2 - 1, 22, 14, { font: disp(14) });
    } else {
      T(dc, statusLine(g), cx, y + (h - 10) / 2, 32, 10, { font: bodyF(9.5), color: C.dim });
      if (A.logos[g.away.abbr]) dc.drawImageInRect(A.logos[g.away.abbr], new Rect(cx + 31, y + (h - 12) / 2, 12, 12));
      T(dc, '@', cx + 44, y + (h - 10) / 2, 10, 10, { font: boldF(9.5), color: C.dim });
      if (A.logos[g.home.abbr]) dc.drawImageInRect(A.logos[g.home.abbr], new Rect(cx + 55, y + (h - 12) / 2, 12, 12));
    }
    cx += need + 6;
    R(dc, cx - 4, y + 5, 1, h - 10, rgba('#ffffff', 0.12));
  }
}
const liveCount = (board) => board.filter((g) => g.state === 'in').length;
async function slateAssets(data, games, keys = []) {
  const ab = [...new Set(games.flatMap((g) => [g.away.abbr, g.home.abbr]))];
  return loadAssets(data, ab.concat([data.club.abbr]), keys, ['fig', 'cheer']);
}
// The day's top performer: the biggest yardage leader among the board's games (his sprite when we have it)
function topPerformer(data, board) {
  const espnMap = byEspnId(data);
  let best = null;
  board.filter((g) => g.state !== 'pre').forEach((g) => {
    const idToAbbr = { [String(g.home.id)]: g.home.abbr, [String(g.away.id)]: g.away.abbr };
    g.leaders.forEach((c) => arr(c.leaders).forEach((l) => {
      const a = l.athlete || {};
      const v = l.value || 0;
      const score = /passing/i.test(c.name) ? v * 0.55 : v;
      const pl = a.id ? espnMap[String(a.id)] : null;
      if (!best || score + (pl ? 3 : 0) > best.score) best = { score: score + (pl ? 3 : 0), abbr: idToAbbr[String((l.team || {}).id)] || g.home.abbr, name: a.displayName || a.shortName, short: a.shortName || '', line: l.displayValue, cat: c.name, pl, g };
    }));
  });
  return best;
}
const performerLine = (p) => prettyLine(p.line).replace(/^(\d+\/\d+) · /, '$1 · ');
async function slateLarge(data, ctx) {
  const sz = widgetSize('large');
  const club = data.club.abbr;
  const games = slateOrder(ctx.board, club);
  const top = topPerformer(data, ctx.board);
  const A = await slateAssets(data, games, top && top.pl ? [top.pl.key] : []);
  const dc = backgroundCtx(sz.w, sz.h, 'league', club, null);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  const day = DAYS[NOW.getDay()].toUpperCase();
  pix(dc, `WEEK ${data.week} · ${day} GAMES`, x0, y + 1, PX, HEX.gold);
  const n = liveCount(ctx.board);
  if (n) liveBadge(dc, x0 + cw, y - 2, `${n} live`, 11);
  y += 17;
  const cellW = (cw - 8) / 2, cellH = 52;
  games.slice(0, 6).forEach((g, i) => gameCell(dc, A, x0 + (i % 2) * (cellW + 8), y + Math.floor(i / 2) * (cellH + 6), cellW, cellH, g, club));
  y += 3 * (cellH + 6) + 2;
  const sh = sz.h - PAD.bottom - 14 - y;
  if (top) {
    drawStage(dc, A, x0, y, cw, sh, top.abbr, top.abbr, true);
    if (top.pl) drawSprite(dc, sprOf(A, top.pl.key, 'cheer'), x0 + cw * 0.14, y + sh - 4, 3);
    const bx = x0 + cw * 0.24, bw = cw * 0.74 - 8;
    fillRounded(dc, bx, y + sh - 40, bw, 34, 9, rgba('#080c1a', 0.78));
    pix(dc, 'TOP PERFORMER SO FAR', bx + 9, y + sh - 36, 1, HEX.gold);
    const nm = top.pl ? top.pl.last : (top.short || top.name).split(' ').slice(-1)[0];
    const ns = nameStrip(dc, nm, bx + 9, y + sh - 25, top.abbr, 12, 'left', 100);
    T(dc, clip(performerLine(top), bw - ns.w - 22, 11.5), bx + 9 + ns.w + 7, y + sh - 23, bw - ns.w - 20, 11.5, { font: boldF(11.5) });
  }
  pix(dc, `${data.season} · WK ${data.week}`, x0, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  pixRight(dc, `UPDATED ${clockAmPm(NOW)}`, x0 + cw, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function slateMedium(data, ctx) {
  const sz = widgetSize('medium');
  const club = data.club.abbr;
  const games = slateOrder(ctx.board, club);
  const style = tickStyle(['ticker', 'bottom']);
  const top = topPerformer(data, ctx.board);
  const A = await slateAssets(data, games, top && top.pl ? [top.pl.key] : []);
  const dc = backgroundCtx(sz.w, sz.h, style === 'bottom' && involves(ctx.board[0] || games[0], club) ? 'solo' : 'league', club, null);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  const n = liveCount(ctx.board);
  if (style === 'ticker') {
    const pages = Math.max(1, Math.ceil(games.length / 4));
    const page = pages === 1 ? 0 : Math.floor(NOWMS / (10 * MIN)) % pages;
    pix(dc, `SCORES · PAGE ${page + 1} OF ${pages}`, x0, y + 1, PX, HEX.gold);
    if (n) liveBadge(dc, x0 + cw, y - 2, `${n} live`, 11);
    y += 16;
    const cellW = (cw - 6) / 2, cellH = 44;
    games.slice(page * 4, page * 4 + 4).forEach((g, i) => gameCell(dc, A, x0 + (i % 2) * (cellW + 6), y + Math.floor(i / 2) * (cellH + 4), cellW, cellH, g, club, { status: false, rowH: 16, scoreInset: 52 }));
    // status at the cell's right edge for medium
    games.slice(page * 4, page * 4 + 4).forEach((g, i) => {
      const cx = x0 + (i % 2) * (cellW + 6), cy = y + Math.floor(i / 2) * (cellH + 4);
      const live = g.state === 'in';
      const lines = g.state === 'in' ? [quarterText(g).split(' · ')[0], quarterText(g).split(' · ')[1] || ''] : g.state === 'post' ? ['Final', ''] : [statusLine(g), ''];
      T(dc, lines[0], cx + cellW - 44, cy + 11, 38, 10, { font: boldF(10), color: live ? C.live : C.dim, align: 'right' });
      if (lines[1]) T(dc, lines[1], cx + cellW - 44, cy + 23, 38, 10, { font: boldF(10), color: C.live, align: 'right' });
    });
    y += 2 * (cellH + 4);
    const upcoming = games.filter((g) => g.state === 'pre');
    tickerBar(dc, A, x0, sz.h - PAD.bottom - 24, cw, 24, upcoming.length ? upcoming : games.slice(4), 'NEXT');
  } else {
    pix(dc, `NFL · WEEK ${data.week}`, x0, y + 1, PX, HEX.gold);
    if (n) liveBadge(dc, x0 + cw, y - 2, `${n} live`, 11);
    y += 17;
    const hl = top;
    if (hl && hl.pl) drawSprite(dc, sprOf(A, hl.pl.key, 'cheer'), x0 + 18, y + 60, 2);
    fillRounded(dc, x0 + 42, y, cw - 42, 62, 10, rgba('#080c1a', 0.75));
    if (hl) {
      const nm = hl.pl ? hl.pl.last : (hl.short || hl.name).split(' ').slice(-1)[0];
      T(dc, clip(`${nm} ${performerLine(hl)}`, cw - 62, 13), x0 + 52, y + 7, cw - 62, 13, { font: boldF(13) });
      const words = (hl.g.headline || `${hl.g.away.abbr} ${hl.g.away.score}, ${hl.g.home.abbr} ${hl.g.home.score}`).split(' ');
      const lines = ['', ''];
      let li = 0;
      words.forEach((wd) => { if (li === 0 && estW(lines[0] + ' ' + wd, 10.5) > cw - 66) li = 1; lines[li] += (lines[li] ? ' ' : '') + wd; });
      T(dc, clip(lines[0], cw - 62, 10.5), x0 + 52, y + 27, cw - 62, 10.5, { font: bodyF(10.5), color: C.dim });
      if (lines[1]) T(dc, clip(lines[1], cw - 62, 10.5), x0 + 52, y + 41, cw - 62, 10.5, { font: bodyF(10.5), color: C.dim });
    }
    tickerBar(dc, A, x0, sz.h - PAD.bottom - 26, cw, 26, games.filter((g) => g.state !== 'pre').concat(games.filter((g) => g.state === 'pre')));
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function slateSmall(data, ctx) {
  const sz = widgetSize('small');
  const club = data.club.abbr;
  const games = slateOrder(ctx.board, club);
  const A = await slateAssets(data, games);
  const dc = backgroundCtx(sz.w, sz.h, 'league', club, null);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  const pages = Math.max(1, Math.ceil(games.length / 2));
  const page = pages === 1 ? 0 : Math.floor(NOWMS / (10 * MIN)) % pages;
  pix(dc, `SCORES · ${page + 1}/${pages}`, x0, PAD.top + 1, PX, HEX.gold);
  let y = PAD.top + 14;
  games.slice(page * 2, page * 2 + 2).forEach((g, i) => {
    gameCell(dc, A, x0, y + i * 52, cw, 48, g, club, { status: false, rowH: 16, scoreInset: 48 });
    const lt = g.state === 'in' ? quarterText(g).split(' · ')[0] : g.state === 'post' ? 'F' : statusLine(g);
    T(dc, lt, x0 + cw - 36, y + i * 52 + 17, 30, 10, { font: boldF(10), color: g.state === 'in' ? C.live : C.dim, align: 'right' });
  });
  const n = liveCount(ctx.board);
  const mine = games.some((g) => involves(g, club));
  T(dc, mine ? 'Your game first' : 'League scores', x0, sz.h - PAD.bottom - 11, cw, 10, { font: bodyF(10), color: C.dim });
  if (n > 0) T(dc, `${n} live`, x0, sz.h - PAD.bottom - 11, cw, 10, { font: boldF(10), color: new Color(HEX.gold), align: 'right' });
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
// The bottom line, large: the headline over the performer on the turf, the live games with context, the ticker bar
async function slateLargeBottom(data, ctx) {
  const sz = widgetSize('large');
  const club = data.club.abbr;
  const games = slateOrder(ctx.board, club);
  const top = topPerformer(data, ctx.board);
  const A = await slateAssets(data, games, top && top.pl ? [top.pl.key] : []);
  const dc = backgroundCtx(sz.w, sz.h, 'league', club, null);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  pix(dc, `BOTTOM LINE · WEEK ${data.week}`, x0, y + 1, PX, HEX.gold);
  const live = liveCount(ctx.board), fin = ctx.board.filter((g) => g.state === 'post').length;
  liveBadge(dc, x0 + cw, y - 2, `${live} live · ${fin} final`, 11);
  y += 17;
  const sh = 92;
  drawStage(dc, A, x0, y, cw, sh, top ? top.abbr : club, top ? top.abbr : club, false);
  if (top && top.pl) drawSprite(dc, sprOf(A, top.pl.key, 'cheer'), x0 + 28, y + sh - 3, 3);
  fillRounded(dc, x0 + 60, y + 38, cw - 68, 46, 9, rgba('#080c1a', 0.78));
  pix(dc, 'HEADLINE', x0 + 69, y + 43, 1, HEX.gold);
  if (top) {
    const nm = top.pl ? top.pl.last : (top.short || top.name).split(' ').slice(-1)[0];
    T(dc, clip(`${nm} ${performerLine(top)}`, cw - 88, 12.5), x0 + 69, y + 55, cw - 88, 12.5, { font: boldF(12.5) });
    T(dc, clip(top.g.headline || `${top.g.away.abbr} ${top.g.away.score}, ${top.g.home.abbr} ${top.g.home.score}`, cw - 88, 10), x0 + 69, y + 69, cw - 88, 10, { font: bodyF(10), color: C.dim });
  }
  y += sh + 6;
  const shown = games.filter((g) => g.state !== 'pre').slice(0, 5);
  shown.forEach((g) => {
    fillRounded(dc, x0, y, cw, 36, 9, rgba('#080c1a', 0.62));
    const mine = involves(g, club);
    if (mine) strokeRounded(dc, x0 + 0.75, y + 0.75, cw - 1.5, 34.5, 8.5, 1.5, new Color(HEX.live));
    const lead = (g.away.score || 0) >= (g.home.score || 0) ? g.away : g.home;
    if (A.logos[lead.abbr]) dc.drawImageInRect(A.logos[lead.abbr], new Rect(x0 + 8, y + 9, 18, 18));
    T(dc, `${g.away.abbr} ${g.away.score || 0} · ${g.home.abbr} ${g.home.score || 0}`, x0 + 34, y + 3.5, cw - 100, 13, { font: semiF(13) });
    const fl = flagOf(g);
    const ctxLine = fl ? fl[0] === 'UPSET?' || fl[0] === 'UPSET' ? `Upset alert: ${oddsFavourite(g) ? oddsFavourite(g).abbr : ''} was a ${oddsFavourite(g) ? oddsFavourite(g).spread : ''}-pt favourite` : fl[0] === 'CLOSE' ? `One-score game${g.sit && g.sit.poss ? ', ' + g.sit.poss + ' ball' : ''}` : 'In the red zone' : g.sit && g.sit.dd ? `${g.sit.dd}${g.sit.spot ? ' at ' + g.sit.spot.side + ' ' + g.sit.spot.yd : ''}` : g.headline || '';
    T(dc, clip(ctxLine, cw - 100, 10), x0 + 34, y + 19.5, cw - 100, 10, { font: bodyF(10), color: fl ? new Color(fl[1] === HEX.gold ? HEX.gold : fl[1]) : C.dim });
    T(dc, g.state === 'post' ? 'Final' : quarterText(g), x0 + cw - 72, y + 11, 64, 11, { font: boldF(11), color: g.state === 'in' ? C.live : C.dim, align: 'right' });
    y += 38;
  });
  // leaders today
  const ld = top;
  if (ld) {
    fillRounded(dc, x0, y, cw, 24, 8, rgba('#080c1a', 0.55));
    const kw = pix(dc, 'LEADERS TODAY', x0 + 8, y + 9.5, 1, HEX.dim);
    T(dc, clip(`${(ld.short || '').split(' ').slice(-1)[0]} ${performerLine(ld)}`, cw - kw - 24, 10.5), x0 + 8 + kw + 6, y + 5.5, cw - kw - 20, 10.5, { font: bodyF(10.5) });
  }
  tickerBar(dc, A, x0, sz.h - PAD.bottom - 26, cw, 26, games.filter((g) => g.state === 'pre').concat(games.filter((g) => g.state !== 'pre')));
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}

// ---------- shared: rings, the club's side of a game ----------
function ringArc(dc, cx, cy, r, lw, from, to, color) {
  const p = new Path();
  const n = Math.max(2, Math.ceil((to - from) * 60));
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + 2 * Math.PI * (from + ((to - from) * i) / n);
    const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (i) p.addLine(pt); else p.move(pt);
  }
  dc.addPath(p); dc.setStrokeColor(color); dc.setLineWidth(lw); dc.strokePath();
}
const upDown = (d) => (d > 0 ? ['▲', HEX.up] : ['▼', HEX.live]);
const oddsDelta = (data) => (data.odds && data.odds.prev != null ? Math.round((data.odds.playoffs - data.odds.prev) * 100) : null);
const seedNow = (data) => { const s = (data.odds && data.odds.seeds) || []; const m = Math.max(...s, 0); return m > 0 ? s.indexOf(m) + 1 : null; };
const ordinalN = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');
const wlText = (c) => `${c.w}-${c.l}${c.t ? '-' + c.t : ''}`;
function resultWord(g, club) {
  const s = sides(g, club);
  const a = s.me.score || 0, b = s.opp.score || 0;
  return a > b ? 'W' : a < b ? 'L' : 'T';
}
const WLC = { W: HEX.up, L: HEX.live, T: HEX.gold };
const clubSideFirst = (g, club) => { const s = sides(g, club); return involves(g, club) ? [s.me, s.opp] : [g.away, g.home]; };

// ---------- the final ----------
async function finalCommon(data, ctx) {
  const g = ctx.game, club = data.club.abbr;
  const espnMap = byEspnId(data), leaders = clubLeaders(g, ctx.summary, espnMap);
  const [me, opp] = clubSideFirst(g, club);
  const qb = qbFor(data, espnMap, leaders, me.abbr);
  const hand = playerFor(data, espnMap, hotHand(leaders[me.abbr]));
  const keys = [qb, hand].filter(Boolean).map((p) => p.key);
  const A = await loadAssets(data, [me.abbr, opp.abbr], keys, ['fig', 'left', 'cheer']);
  return { g, A, club, me, opp, leaders, qb, hand, handRaw: hotHand(leaders[me.abbr]), oppRaw: hotHand(leaders[opp.abbr]), oppQbRaw: arr(leaders[opp.abbr]).find((l) => /passing/i.test(l.cat)),
    myQbRaw: arr(leaders[me.abbr]).find((l) => /passing/i.test(l.cat)) };
}
function oddsNote(dc, data, x, y, w, size = 11) {
  const d = oddsDelta(data);
  let s = `Playoffs ${pct(data.odds.playoffs)}`;
  T(dc, s, x, y, w, size, { font: bodyF(size), color: C.dim, align: 'right' });
  if (d) { const [ar, col] = upDown(d); T(dc, `${ar} ${Math.abs(d)}`, x, y, w - estW(s, size) - 4, size, { font: boldF(size), color: new Color(col), align: 'right' }); }
}
async function finalMedium(data, ctx) {
  const sz = widgetSize('medium');
  const F = await finalCommon(data, ctx);
  const { g, A, me, opp } = F;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', me.abbr, opp.abbr, [A.logos[me.abbr], A.logos[opp.abbr]]);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  pix(dc, `FINAL · WEEK ${data.week}`, x0, y + 1, PX, HEX.gold);
  oddsNote(dc, data, x0 + cw - 150, y - 2, 150, 11);
  y += 15;
  const a = me.score || 0, b = opp.score || 0;
  if (A.logos[me.abbr]) dc.drawImageInRect(A.logos[me.abbr], new Rect(x0, y + 3, 30, 30));
  scoreText(dc, a, x0 + 34, y - 3, 64, 40, new Color(a >= b ? '#ffffff' : LOSE), 'left');
  T(dc, 'FINAL', x0 + cw / 2 - 25, y + 14, 50, 11, { font: dispI(11), color: C.dim, align: 'center' });
  scoreText(dc, b, x0 + cw - 98, y - 3, 64, 40, new Color(b >= a ? '#ffffff' : LOSE), 'right');
  if (A.logos[opp.abbr]) dc.drawImageInRect(A.logos[opp.abbr], new Rect(x0 + cw - 30, y + 3, 30, 30));
  y += 42;
  const bh = sz.h - PAD.bottom - y;
  drawStage(dc, A, x0, y, 112, bh, me.abbr, me.abbr, false);
  const feet = y + bh - 3;
  if (F.qb) drawSprite(dc, sprOf(A, F.qb.key, 'cheer'), x0 + 34, feet, 2);
  if (F.hand) drawSprite(dc, sprOf(A, F.hand.key, 'cheer'), x0 + 76, feet, 2);
  const tx = x0 + 122, tw = cw - 122;
  const line = (raw, pl, yy) => {
    if (!raw) return;
    const nm = pl ? pl.last : (raw.short || raw.name).split(' ').slice(-1)[0];
    const ns = nameStrip(dc, nm, tx, yy, me.abbr, 12, 'left', 90);
    T(dc, clip(prettyLine(raw.line), tw - ns.w - 8, 11), tx + ns.w + 7, yy + 1.5, tw - ns.w - 8, 11, { font: boldF(11) });
  };
  line(F.myQbRaw, F.qb, y + 2);
  line(F.handRaw, F.hand, y + 26);
  if (F.oppRaw || F.oppQbRaw) {
    const o = F.oppQbRaw && /TD/.test(F.oppQbRaw.line) ? F.oppQbRaw : F.oppRaw || F.oppQbRaw;
    const nm = (o.short || o.name).split(' ').slice(-1)[0];
    const td = /(\d+) TD/.exec(o.line);
    T(dc, clip(`${nm} ${td ? td[1] + ' TD' : prettyLine(o.line)} in the ${resultWord(g, F.club) === 'W' ? 'loss' : 'win'}`, tw, 10.5), tx, y + 52, tw, 10.5, { font: bodyF(10.5), color: C.dim });
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function finalLarge(data, ctx) {
  const sz = widgetSize('large');
  const F = await finalCommon(data, ctx);
  const { g, A, me, opp } = F;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', me.abbr, opp.abbr, [A.logos[me.abbr], A.logos[opp.abbr]]);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  pix(dc, `FINAL · WEEK ${data.week}`, x0, y + 1, PX, HEX.gold);
  oddsNote(dc, data, x0 + cw - 150, y - 2, 150, 11);
  y += 16;
  const a = me.score || 0, b = opp.score || 0;
  if (A.logos[me.abbr]) dc.drawImageInRect(A.logos[me.abbr], new Rect(x0, y + 4, 34, 34));
  scoreText(dc, a, x0 + 40, y - 2, 70, 46, new Color(a >= b ? '#ffffff' : LOSE), 'left');
  T(dc, 'FINAL', x0 + cw / 2 - 25, y + 17, 50, 12, { font: dispI(12), color: C.dim, align: 'center' });
  scoreText(dc, b, x0 + cw - 110, y - 2, 70, 46, new Color(b >= a ? '#ffffff' : LOSE), 'right');
  if (A.logos[opp.abbr]) dc.drawImageInRect(A.logos[opp.abbr], new Rect(x0 + cw - 34, y + 4, 34, 34));
  y += 48;
  const sh = 92;
  drawStage(dc, A, x0, y, cw, sh, me.abbr, opp.abbr, false);
  const feet = y + sh - 4;
  const row = [[F.qb, 0.2], [F.hand, 0.4]];
  row.forEach(([p, at]) => { if (p) drawSprite(dc, sprOf(A, p.key, 'cheer'), x0 + cw * at, feet, 3); });
  const stat = (raw) => (raw ? prettyLine(raw.line).split(' · ').slice(0, 2).join(' · ') : '');
  const tx = x0 + cw * 0.5, tw = cw * 0.48 - 8;
  fillRounded(dc, tx - 6, y + 40, tw + 8, 46, 9, rgba('#080c1a', 0.74));
  [[F.myQbRaw, F.qb, y + 44], [F.handRaw, F.hand, y + 63]].forEach(([raw, pl, yy]) => {
    if (!raw) return;
    const nm = pl ? pl.last : (raw.short || raw.name).split(' ').slice(-1)[0];
    const ns = nameStrip(dc, nm, tx, yy, me.abbr, 10, 'left', 70);
    T(dc, clip(stat(raw), tw - ns.w - 6, 9.5), tx + ns.w + 5, yy + 1, tw - ns.w - 6, 9.5, { font: boldF(9.5) });
  });
  y += sh + 8;
  lineScore(dc, A, x0 + (cw - 277) / 2, y, g, F.leaders);
  y += 117 + 9;
  fillRounded(dc, x0, y, cw, 26, 9, rgba('#080c1a', 0.62));
  const d = oddsDelta(data);
  const parts = [`${data.club.place} ${data.club.division}`.toUpperCase(), `${wlText(data.club)}`];
  pix(dc, `PLAYOFFS ${pct(data.odds.playoffs)}`, x0 + 9, y + 10.5, 1.15, HEX.gold);
  if (d) { const [ar, col] = upDown(d); T(dc, `${ar}${Math.abs(d)}`, x0 + 9 + pixW(`PLAYOFFS ${pct(data.odds.playoffs)}`) * 1.15 + 6, y + 6, 40, 11, { font: boldF(11), color: new Color(col) }); }
  T(dc, parts.join(' · '), x0 + cw - 190, y + 6, 181, 11, { font: boldF(11), color: C.dim, align: 'right' });
  pixRight(dc, `UPDATED ${clockAmPm(NOW)}`, x0 + cw, sz.h - PAD.bottom - 5, 0.95, '#6d7896');
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function finalSmall(data, ctx) {
  const sz = widgetSize('small');
  const F = await finalCommon(data, ctx);
  const { g, A, me, opp } = F;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', me.abbr, opp.abbr, [A.logos[me.abbr], A.logos[opp.abbr]]);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  const res = resultWord(g, F.club);
  pix(dc, `FINAL · WK ${data.week}`, x0, PAD.top + 1, PX, HEX.gold);
  let y = PAD.top + 14;
  [me, opp].forEach((t, i) => {
    const o = i === 0 ? opp : me;
    const sc = t.score || 0;
    if (A.logos[t.abbr]) dc.drawImageInRect(A.logos[t.abbr], new Rect(x0, y + 2, 28, 28));
    scoreText(dc, sc, x0 + 34, y - 2, 60, 36, new Color(sc >= (o.score || 0) ? '#ffffff' : LOSE), 'left');
    y += 35;
  });
  const w = 26;
  fillRounded(dc, x0, y + 4, w, 18, 5, new Color(WLC[res]));
  T(dc, res, x0, y + 5.5, w, 14, { font: dispI(14), color: Color.white(), align: 'center' });
  T(dc, me.rec || wlText(data.club), x0 + w + 8, y + 6, 70, 13, { font: boldF(13) });
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}

// ---------- preview: the day before ----------
async function previewAssets(data) {
  const n = data.next, club = data.club.abbr;
  const myQb = arr((data.top || {})[club]).find((k) => k.startsWith('QB:'));
  const oppQb = arr((data.top || {})[n.opp]).find((k) => k.startsWith('QB:'));
  const keys = [myQb, oppQb].filter(Boolean);
  const A = await loadAssets(data, [club, n.opp], keys, ['fig', 'left']);
  return { A, myQb, oppQb };
}
const winBar = (dc, x, y, w, p, ca, cb, h = 8) => {
  fillRounded(dc, x, y, w, h, h / 2, new Color(cb));
  fillRounded(dc, x, y, Math.max(h, w * p), h, h / 2, new Color(ca));
};
const lineText = (data) => { const n = data.next; const l = n.line; return l == null ? '' : `${l >= 0 ? data.club.abbr + ' -' + l : n.opp + ' -' + Math.abs(l)}`; };
async function previewLarge(data) {
  const sz = widgetSize('large');
  const { A, myQb, oppQb } = await previewAssets(data);
  const club = data.club.abbr, n = data.next;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', club, n.opp, [A.logos[club], A.logos[n.opp]]);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  let y = PAD.top;
  pix(dc, `NEXT GAME · WEEK ${n.week}`, x0, y + 1, PX, HEX.gold);
  T(dc, `in ${untilText(Date.parse(n.kickoff) - NOWMS)}`, x0 + cw - 120, y - 2, 120, 11, { font: boldF(11), color: new Color(HEX.gold), align: 'right' });
  y += 17;
  const sh = 142;
  drawStage(dc, A, x0, y, cw, sh, club, n.opp, false);
  const lgS = 30;
  if (A.logos[club]) dc.drawImageInRect(A.logos[club], new Rect(x0 + cw * 0.24 - lgS / 2, y + 8, lgS, lgS));
  if (A.logos[n.opp]) dc.drawImageInRect(A.logos[n.opp], new Rect(x0 + cw * 0.76 - lgS / 2, y + 8, lgS, lgS));
  if (myQb) drawSprite(dc, sprOf(A, myQb, 'fig'), x0 + cw * 0.14, y + sh - 6, 3);
  if (oppQb) drawSprite(dc, sprOf(A, oppQb, 'left'), x0 + cw * 0.86, y + sh - 6, 3);
  fillRounded(dc, x0 + cw * 0.5 - 72, y + 62, 144, 56, 10, rgba('#080c1a', 0.78));
  T(dc, kickText(n.kickoff).toUpperCase(), x0 + cw * 0.5 - 72, y + 66, 144, 22, { font: dispI(22), align: 'center' });
  T(dc, `${n.home ? 'vs' : '@'} ${tm(n.opp)[0]}`, x0 + cw * 0.5 - 72, y + 93, 144, 12, { font: boldF(11), color: C.chalk, align: 'center' });
  y += sh + 8;
  // win chance
  fillRounded(dc, x0, y, cw, 40, 10, rgba('#080c1a', 0.62));
  const wp = n.win;
  if (wp != null) {
    T(dc, `${Math.round(wp * 100)}%`, x0 + 10, y + 5, 60, 20, { font: dispI(20) });
    T(dc, `win ${n.home ? 'vs' : '@'} ${n.opp}`, x0 + 10 + estW(`${Math.round(wp * 100)}%`, 20, 'cond') + 8, y + 11, 90, 11, { font: bodyF(11), color: C.dim });
    winBar(dc, x0 + 10, y + 29, cw - 20, wp, stripColor(club) === '#101820' ? secondary(club) : mixHex(stripColor(club), '#ffffff', 0.25), stripColor(n.opp));
  } else T(dc, 'Win chance after the next update', x0 + 10, y + 12, cw - 20, 12, { color: C.dim });
  T(dc, [lineText(data), n.roof === 'dome' || n.roof === 'closed' ? 'dome' : 'outdoors'].filter(Boolean).join(' · '), x0 + cw - 150, y + 6, 140, 11, { font: bodyF(11), color: C.dim, align: 'right' });
  T(dc, `${wlText(data.club)} · ${data.club.place} ${data.club.division}`, x0 + cw - 190, y + 19, 180, 10, { font: bodyF(10), color: C.dim, align: 'right' });
  y += 48;
  // playoff tiles
  const half = (cw - 8) / 2;
  [['PLAYOFFS', pct(data.odds.playoffs), `seed ${seedNow(data) || ''}`.trim()], ['DIVISION', pct(data.odds.divWin), `${data.club.division}`]].forEach(([k, v, sub], i) => {
    const bx = x0 + i * (half + 8);
    fillRounded(dc, bx, y, half, 46, 10, rgba('#080c1a', 0.62));
    pix(dc, k, bx + 9, y + 7, 1, HEX.dim);
    T(dc, v, bx + 9, y + 17, 80, 22, { font: dispI(22) });
    T(dc, sub, bx + half - 94, y + 25, 86, 10, { font: bodyF(10), color: C.dim, align: 'right' });
  });
  y += 54;
  // injuries
  const inj = arr(data.injuries);
  const ih = sz.h - PAD.bottom - 14 - y;
  fillRounded(dc, x0, y, cw, ih, 10, rgba('#080c1a', 0.55));
  const last = data.last;
  let iy = y + 8;
  if (last) {
    pix(dc, 'LAST GAME', x0 + 9, iy, 1, HEX.dim);
    T(dc, `${last.result} ${last.for}-${last.against} ${last.home ? 'vs' : '@'} ${last.opp}`, x0 + 9 + 66, iy - 4, cw - 90, 12, { font: boldF(12), color: new Color(WLC[last.result] || '#ffffff') });
    iy += 22;
  }
  pix(dc, 'INJURY REPORT', x0 + 9, iy, 1, HEX.dim);
  if (!inj.length) T(dc, 'Nobody listed', x0 + 9, iy + 14, cw - 18, 11, { color: C.dim });
  inj.slice(0, Math.max(1, Math.floor((y + ih - iy - 14) / 22))).forEach((p, i) => {
    const ry = iy + 12 + i * 22;
    nameStrip(dc, p.last, x0 + 9, ry, club, 11.5, 'left', 110);
    T(dc, `${p.pos} · ${p.status}${p.part ? ' · ' + p.part : ''}`, x0 + 128, ry + 2.5, cw - 140, 10.5, { font: bodyF(10.5), color: p.status === 'Out' || p.status === 'IR' ? new Color(HEX.live) : C.dim });
  });
  pix(dc, `${data.season} · WK ${data.week}`, x0, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  pixRight(dc, `UPDATED ${clockAmPm(NOW)}`, x0 + cw, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function previewMedium(data) {
  const sz = widgetSize('medium');
  const { A, myQb, oppQb } = await previewAssets(data);
  const club = data.club.abbr, n = data.next;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', club, n.opp, [A.logos[club], A.logos[n.opp]]);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  const lw = cw - 118;
  let y = PAD.top;
  pix(dc, `NEXT · WEEK ${n.week}`, x0, y + 1, PX, HEX.gold);
  T(dc, `in ${untilText(Date.parse(n.kickoff) - NOWMS)}`, x0 + lw - 90, y - 2, 90, 11, { font: boldF(11), color: new Color(HEX.gold), align: 'right' });
  y += 16;
  if (A.logos[n.opp]) dc.drawImageInRect(A.logos[n.opp], new Rect(x0, y, 34, 34));
  T(dc, `${n.home ? 'vs' : '@'} ${n.opp}`, x0 + 40, y - 1, lw - 40, 26, { font: dispI(26) });
  T(dc, `${tm(n.opp)[0]}${n.oppRec ? ' · ' + n.oppRec : ''}`, x0 + 40, y + 27, lw - 40, 10, { font: bodyF(10), color: C.dim });
  y += 40;
  T(dc, kickText(n.kickoff), x0, y, lw, 15, { font: dispI(15) });
  T(dc, [lineText(data), n.roof === 'dome' ? 'dome' : ''].filter(Boolean).join(' · '), x0 + lw - 110, y + 2, 110, 10.5, { font: bodyF(10.5), color: C.dim, align: 'right' });
  y += 22;
  if (n.win != null) {
    T(dc, `${Math.round(n.win * 100)}%`, x0, y - 3, 50, 17, { font: dispI(17) });
    T(dc, `win ${n.home ? 'vs' : '@'} ${n.opp}`, x0 + estW(`${Math.round(n.win * 100)}%`, 17, 'cond') + 8, y, 90, 11, { font: bodyF(11), color: C.dim });
    winBar(dc, x0, y + 17, lw, n.win, mixHex(stripColor(club), '#ffffff', 0.25), stripColor(n.opp), 7);
  }
  const px = x0 + lw + 10, pw = 108, ph = sz.h - PAD.top - PAD.bottom;
  drawStage(dc, A, px, PAD.top, pw, ph, club, n.opp, false);
  if (myQb) drawSprite(dc, sprOf(A, myQb, 'fig'), px + 27, PAD.top + ph - 5, 3);
  if (oppQb) drawSprite(dc, sprOf(A, oppQb, 'left'), px + pw - 27, PAD.top + ph - 5, 3);
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function previewSmall(data) {
  const sz = widgetSize('small');
  const A = await loadAssets(data, [data.club.abbr, data.next.opp], [], []);
  const club = data.club.abbr, n = data.next;
  const dc = backgroundCtx(sz.w, sz.h, 'duo', club, n.opp, [A.logos[club], A.logos[n.opp]]);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  pix(dc, `NEXT · WK ${n.week}`, x0, PAD.top + 1, PX, HEX.gold);
  if (A.logos[n.opp]) dc.drawImageInRect(A.logos[n.opp], new Rect(x0, PAD.top + 16, 38, 38));
  T(dc, `${n.home ? 'vs' : '@'} ${n.opp}`, x0 + 44, PAD.top + 17, cw - 44, 28, { font: dispI(28) });
  let y = PAD.top + 62;
  T(dc, kickText(n.kickoff), x0, y, cw, 16, { font: dispI(16) });
  T(dc, `in ${untilText(Date.parse(n.kickoff) - NOWMS)}`, x0, y + 19, cw, 11, { font: bodyF(11), color: C.dim });
  if (n.win != null) {
    y = sz.h - PAD.bottom - 32;
    T(dc, `${Math.round(n.win * 100)}% win`, x0, y, cw, 12, { font: boldF(12) });
    winBar(dc, x0, y + 18, cw, n.win, mixHex(stripColor(club), '#ffffff', 0.25), stripColor(n.opp), 7);
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}

// ---------- between games ----------
async function betweenAssets(data) {
  const club = data.club.abbr;
  const keys = [data.best && data.best.key, ...arr(data.mvp).map((p) => p.key)].filter(Boolean);
  const abbrs = [club, ...(data.next ? [data.next.opp] : []), ...arr(data.mvp).map((p) => p.team)];
  const A = await loadAssets(data, abbrs, keys, ['fig', 'cheer']);
  return A;
}
const SEASON_TAG = { x: 'Clinched a playoff spot', y: 'Won the division', z: 'Clinched the No. 1 seed', e: 'Eliminated' };
// The club card: his best player celebrating on the club's turf, the record, the next game, the odds
function clubCard(dc, A, data, x, y, w, h, opts = {}) {
  const club = data.club.abbr, n = data.next;
  const sw = opts.stageW || 118;
  drawStage(dc, A, x, y, sw, h, club, club, false);
  const b = data.best;
  if (b) {
    drawSprite(dc, sprOf(A, b.key, 'cheer'), x + sw / 2, y + h - (opts.nameBelow === false ? 6 : 28), 3);
    nameStrip(dc, b.last, x + sw / 2, y + h - 22, club, 11, 'center', sw - 22);
  }
  const tx = x + sw + 12, tw = w - sw - 12;
  let ty = y + 2;
  if (A.logos[club]) dc.drawImageInRect(A.logos[club], new Rect(tx, ty, 30, 30));
  T(dc, wlText(data.club), tx + 36, ty - 3, 90, 34, { font: dispI(34) });
  T(dc, `${data.club.place} ${data.club.division.replace(/^[AN]FC /, '')}`, tx + 36 + estW(wlText(data.club), 34, 'cond') + 6, ty + 12, tw, 11, { font: bodyF(11), color: C.dim });
  ty += 36;
  if (n && !opts.offseason) {
    if (A.logos[n.opp]) dc.drawImageInRect(A.logos[n.opp], new Rect(tx, ty, 16, 16));
    T(dc, `${n.home ? 'vs' : '@'} ${n.opp} · ${kickShort(n.kickoff)}`, tx + 21, ty + 1, tw - 80, 12, { font: boldF(12) });
    T(dc, untilText(Date.parse(n.kickoff) - NOWMS), tx + tw - 60, ty + 1, 60, 12, { font: boldF(12), color: new Color(HEX.gold), align: 'right' });
  } else if (opts.offseason) {
    T(dc, 'Season complete', tx, ty, tw, 12, { font: boldF(12) });
  }
  ty += 21;
  const o = data.odds;
  T(dc, pct(o.playoffs), tx, ty - 3, 60, 18, { font: dispI(18) });
  T(dc, 'playoffs', tx + estW(pct(o.playoffs), 18, 'cond') + 8, ty, 60, 11, { font: bodyF(11), color: C.dim });
  if (n && n.win != null && !opts.offseason) {
    const wx = tx + tw * 0.52;
    T(dc, `${Math.round(n.win * 100)}%`, wx, ty - 3, 50, 18, { font: dispI(18) });
    T(dc, `win ${n.home ? 'vs' : '@'} ${n.opp}`, wx + estW(`${Math.round(n.win * 100)}%`, 18, 'cond') + 8, ty, 80, 11, { font: bodyF(11), color: C.dim });
  } else if (opts.offseason) T(dc, SEASON_TAG[o.tag] || (o.playoffs > 0.5 ? 'In the field' : 'Missed the playoffs'), tx + tw * 0.46, ty, tw * 0.54, 11, { font: bodyF(11), color: C.dim, align: 'right' });
  ty += 22;
  const last = data.last;
  if (last) {
    T(dc, clip(`LAST  ${last.result} ${last.for}-${last.against} ${last.home ? 'vs' : '@'} ${last.opp}`, tw, 10.5), tx, ty, tw, 10.5, { font: bodyF(10.5), color: C.dim });
  }
  const inj = arr(data.injuries)[0];
  if (inj && h > 120) T(dc, clip(`INJURY  ${inj.last} (${inj.status})`, tw, 10.5), tx, ty + 14, tw, 10.5, { font: bodyF(10.5), color: C.dim });
}
function playoffBlock(dc, A, data, x, y, w, h) {
  const club = data.club.abbr, o = data.odds;
  fillRounded(dc, x, y, w, h, 10, rgba('#080c1a', 0.62));
  const rs = Math.min(h - 14, 54), cx = x + 10 + rs / 2, cy = y + h / 2;
  ringArc(dc, cx, cy, rs / 2 - 3, 6, 0, 1, rgba('#ffffff', 0.12));
  ringArc(dc, cx, cy, rs / 2 - 3, 6, 0, Math.max(0.02, Math.min(1, o.playoffs)), new Color(inkOf(club)));
  if (A.logos[club]) dc.drawImageInRect(A.logos[club], new Rect(cx - 10, cy - 10, 20, 20));
  const tx = x + rs + 24;
  pix(dc, `PLAYOFF RACE · ${data.club.conf}`, tx, y + 8, 1, HEX.dim);
  T(dc, pct(o.playoffs), tx, y + 17, 70, 24, { font: dispI(24) });
  const seed = seedNow(data);
  const lines = [o.tag ? SEASON_TAG[o.tag] : (seed ? `Most likely seed: ${ordinalN(seed)}` : ''), o.scenarios && o.scenarios[0] ? o.scenarios[0] : `Division ${pct(o.divWin)} · bye ${pct(o.bye)}`];
  T(dc, clip(lines[0], w - rs - 34, 10.5), tx + 76, y + 20, w - rs - 110, 10.5, { font: boldF(10.5), color: C.chalk });
  T(dc, clip(lines[1], w - rs - 34, 10), tx, y + h - 17, w - rs - 34, 10, { font: bodyF(10), color: C.dim });
}
function mvpRows(dc, A, data, x, y, w, rowH, n = 3) {
  arr(data.mvp).slice(0, n).forEach((p, i) => {
    const ry = y + i * rowH;
    const bust = bustImage(sprOf(A, p.key, 'fig'), rowH - 4, p.team);
    dc.drawImageInRect(bust, new Rect(x, ry, rowH - 4, rowH - 4));
    nameStrip(dc, p.last, x + rowH + 2, ry + (rowH - 4 - 18) / 2, p.team, 13, 'left', 130);
    T(dc, `${p.pos} · ${p.team}`, x + rowH + 122, ry + (rowH - 4) / 2 - 6, 70, 10.5, { font: bodyF(10.5), color: C.dim });
    T(dc, p.szn, x + w - 50, ry + (rowH - 4) / 2 - 10, 50, 20, { font: dispI(20), align: 'right' });
  });
}
async function betweenLarge(data, ctx) {
  const sz = widgetSize('large');
  const A = await betweenAssets(data);
  const club = data.club.abbr;
  const dc = backgroundCtx(sz.w, sz.h, 'solo', club, null, [A.logos[club]]);
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  const off = ctx.mode === 'offseason';
  let y = PAD.top;
  pix(dc, off ? `${data.season} SEASON` : `WEEK ${data.week} · ${data.club.name.toUpperCase()}`, x0, y + 1, PX, HEX.gold);
  pixRight(dc, `POWER NO. ${data.club.power}`, x0 + cw, y + 1, PX, '#c9d0e4');
  y += 16;
  clubCard(dc, A, data, x0, y, cw, 140, { offseason: off, stageW: 124 });
  y += 146;
  playoffBlock(dc, A, data, x0, y, cw, 70);
  y += 76;
  const mh = sz.h - PAD.bottom - 14 - y;
  fillRounded(dc, x0, y, cw, mh, 10, rgba('#080c1a', 0.62));
  pix(dc, 'MVP RACE · BY SZN', x0 + 9, y + 8, 1, HEX.dim);
  mvpRows(dc, A, data, x0 + 9, y + 20, cw - 18, Math.floor((mh - 22) / 3));
  pix(dc, `${data.season} · WK ${data.week}`, x0, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  pixRight(dc, `UPDATED ${clockAmPm(NOW)}`, x0 + cw, sz.h - PAD.bottom - 6, 0.95, '#6d7896');
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
const betweenView = () => FORCE.view || ['club', 'race', 'mvp'][TODAY % 3];
async function betweenMedium(data, ctx) {
  const sz = widgetSize('medium');
  const A = await betweenAssets(data);
  const club = data.club.abbr, view = betweenView();
  const off = ctx.mode === 'offseason';
  const dc = backgroundCtx(sz.w, sz.h, view === 'mvp' ? 'league' : 'solo', club, null, [A.logos[club]]);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side, ph = sz.h - PAD.top - PAD.bottom;
  if (view === 'club') {
    clubCard(dc, A, data, x0, PAD.top, cw, ph, { offseason: off, stageW: 112, nameBelow: true });
    pix(dc, `POWER NO. ${data.club.power}${data.best ? ' · ' + data.best.last.toUpperCase() + ' SZN ' + data.best.szn : ''}`, x0 + 124, sz.h - PAD.bottom - 5, 0.95, '#c9d0e4');
  } else if (view === 'race') {
    playoffBlock(dc, A, data, x0, PAD.top, cw, 74);
    const seeds = data.odds.seeds || [];
    const by = PAD.top + 82, bh = sz.h - PAD.bottom - by;
    pix(dc, 'CHANCE OF EACH SEED', x0, by, 1, HEX.dim);
    const bw = (cw - 6 * 5) / 7, maxH = bh - 26;
    seeds.forEach((v, i) => {
      const bx = x0 + i * (bw + 5), hh = Math.max(3, maxH * Math.min(1, v * 2.4));
      fillRounded(dc, bx, by + 12 + (maxH - hh), bw, hh, 3, new Color(inkOf(club)));
      T(dc, i + 1, bx, by + 12 + maxH + 2, bw, 9, { font: boldF(9), color: C.dim, align: 'center' });
    });
  } else {
    pix(dc, 'MVP RACE · BY SZN', x0, PAD.top + 1, PX, HEX.gold);
    arr(data.mvp).slice(0, 3).forEach((p, i) => {
      const cwid = (cw - 12) / 3, bx = x0 + i * (cwid + 6);
      fillRounded(dc, bx, PAD.top + 14, cwid, ph - 14, 10, rgba('#080c1a', 0.62));
      drawStage(dc, A, bx + 4, PAD.top + 18, cwid - 8, ph - 52, p.team, p.team, false);
      drawSprite(dc, sprOf(A, p.key, 'fig'), bx + cwid / 2, PAD.top + ph - 38, 2);
      nameStrip(dc, p.last, bx + cwid / 2, PAD.top + ph - 31, p.team, 11, 'center', cwid - 8);
      T(dc, p.szn, bx, PAD.top + ph - 14, cwid, 14, { font: dispI(14), align: 'center' });
    });
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}
async function betweenSmall(data, ctx) {
  const sz = widgetSize('small');
  const A = await betweenAssets(data);
  const club = data.club.abbr, view = betweenView() === 'club' ? 'race' : betweenView();
  const dc = backgroundCtx(sz.w, sz.h, view === 'mvp' ? 'league' : 'solo', club, null, [A.logos[club]]);
  CORNER = '#0b1020';
  const cw = sz.w - 2 * PAD.side, x0 = PAD.side;
  if (view === 'race') {
    const o = data.odds, cx = sz.w / 2, cy = PAD.top + 54, r = 46;
    ringArc(dc, cx, cy, r, 11, 0, 1, rgba('#ffffff', 0.14));
    ringArc(dc, cx, cy, r, 11, 0, Math.max(0.02, Math.min(1, o.playoffs)), new Color(inkOf(club)));
    if (A.logos[club]) dc.drawImageInRect(A.logos[club], new Rect(cx - 15, cy - 34, 30, 30));
    T(dc, pct(o.playoffs), cx - 40, cy - 6, 80, 26, { font: dispI(26), align: 'center' });
    const seed = seedNow(data);
    T(dc, `Playoffs${seed ? ' · seed ' + seed + ' likely' : ''}`, x0, sz.h - PAD.bottom - 14, cw, 11, { font: bodyF(11), color: C.dim, align: 'center' });
  } else {
    pix(dc, 'MVP RACE · SZN', x0, PAD.top + 1, PX, HEX.gold);
    mvpRows(dc, A, data, x0, PAD.top + 17, cw, 33, 3);
    pix(dc, `WK ${data.week}`, x0, sz.h - PAD.bottom - 5, 0.95, '#6d7896');
  }
  finishShell(dc, sz.w, sz.h);
  return newWidget(sz.w, sz.h, dc, tap(SITE));
}

// ---------- lock screen (white only: iOS tints it) ----------
function lockText(w, s, font, alpha, lines) {
  const t = w.addText(s);
  t.font = font; t.textColor = new Color('#ffffff', alpha == null ? 1 : alpha);
  t.lineLimit = lines || 1; t.minimumScaleFactor = 0.7;
  return t;
}
function lockLine(data, ctx) {
  const club = data.club.abbr, g = ctx.game, n = data.next;
  if (ctx.mode === 'live' && g) { const s = sides(g, club); const dd = ddText(g); return `${s.a.abbr} ${s.a.score || 0} · ${s.h.abbr} ${s.h.score || 0} · ${quarterText(g).split(' · ')[0]}${dd ? ' · ' + dd : ''}`; }
  if (ctx.mode === 'final' && g) { const [me, opp] = clubSideFirst(g, club); return `Final · ${me.abbr} ${me.score} ${opp.abbr} ${opp.score}`; }
  if (ctx.mode === 'preview' && n) return `${club} ${n.home ? 'vs' : '@'} ${n.opp} · ${kickText(n.kickoff)}${n.win != null ? ' · ' + Math.round(n.win * 100) + '%' : ''}`;
  if (ctx.mode === 'offseason') return `${data.club.name} ${wlText(data.club)} · ${data.season} complete`;
  const opts = [`${club} ${wlText(data.club)} · ${data.club.place} ${data.club.division.replace(/^[AN]FC /, '')} · ${pct(data.odds.playoffs)}`,
    n ? `Next: ${n.home ? 'vs' : '@'} ${n.opp} ${kickText(n.kickoff)}` : null, data.mvp && data.mvp[0] ? `MVP race: ${data.mvp[0].last} ${data.mvp[0].szn}` : null].filter(Boolean);
  return opts[TODAY % opts.length];
}
function gaugeImage(p, big, small, s = 64) {
  const dc = newCtx(s, s);
  ringArc(dc, s / 2, s / 2, 27, 5.5, 0, 1, new Color('#ffffff', 0.25));
  ringArc(dc, s / 2, s / 2, 27, 5.5, 0, Math.max(0.02, Math.min(1, p)), Color.white());
  const a = -Math.PI / 2 + 2 * Math.PI * Math.min(1, p);
  dc.setFillColor(Color.white());
  dc.fillEllipse(new Rect(s / 2 + 27 * Math.cos(a) - 4, s / 2 + 27 * Math.sin(a) - 4, 8, 8));
  dc.setTextAlignedCenter();
  dc.setFont(Font.heavyRoundedSystemFont ? Font.heavyRoundedSystemFont(17) : Font.boldSystemFont(17));
  dc.setTextColor(Color.white());
  dc.drawTextInRect(big, new Rect(0, s / 2 - 14, s, 22));
  dc.setFont(Font.boldSystemFont(small.length > 7 ? 7 : 8));
  dc.setTextColor(new Color('#ffffff', 0.8));
  dc.drawTextInRect(small, new Rect(9, s / 2 + 7, s - 18, 11));
  return dc.getImage();
}
function textRing(big, small, label) {
  const s = 64, dc = newCtx(s, s);
  ringArc(dc, s / 2, s / 2, 28, 2, 0, 1, new Color('#ffffff', 0.35));
  dc.setTextAlignedCenter();
  dc.setFont(Font.boldSystemFont(8)); dc.setTextColor(new Color('#ffffff', 0.85));
  dc.drawTextInRect(label, new Rect(8, 13, s - 16, 11));
  dc.setFont(Font.heavyRoundedSystemFont ? Font.heavyRoundedSystemFont(21) : Font.boldSystemFont(21)); dc.setTextColor(Color.white());
  dc.drawTextInRect(big, new Rect(0, s / 2 - 9, s, 26));
  dc.setFont(Font.boldSystemFont(8)); dc.setTextColor(new Color('#ffffff', 0.85));
  dc.drawTextInRect(small, new Rect(8, s / 2 + 14, s - 16, 11));
  return dc.getImage();
}
async function silhouetteOf(data, key) {
  const p = key && (data.players || {})[key];
  return p && p.sprites && p.sprites.sil ? dataImage(p.sprites.sil) : null;
}
function silhouetteFigure(img, w, h) {
  const dc = newCtx(w, h);
  drawSprite(dc, img, w / 2, h - 3, 2);
  return dc.getImage();
}
async function renderLock(data, ctx) {
  const club = data.club.abbr, g = ctx.game, n = data.next;
  const w = new ListWidget();
  w.url = tap(SITE);
  if (FAMILY === 'accessoryInline') {
    const t = w.addText(lockLine(data, ctx)); t.lineLimit = 1;
    return w;
  }
  if (FAMILY === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    w.setPadding(0, 0, 0, 0);
    let image;
    const wc = ctx.mode === 'live' && g ? winChance(ctx, g, club) : null;
    if (wc) image = gaugeImage(wc.p, `${Math.round(wc.p * 100)}%`, `WIN ${involves(g, club) ? club : g.home.abbr}`);
    else if (ctx.mode === 'final' && g) { const [me, opp] = clubSideFirst(g, club); image = textRing(resultWord(g, club), `${me.score}-${opp.score}`, 'FINAL'); }
    else if ((ctx.mode === 'preview' || ctx.mode === 'between') && n && (ctx.mode === 'preview' || betweenView() !== 'race')) {
      if (ctx.mode === 'between' && betweenView() === 'mvp' && data.mvp[0]) {
        const sil = await silhouetteOf(data, data.mvp[0].key);
        if (sil) { const dc = newCtx(64, 64); drawSprite(dc, sil, 32, 62, 3); image = dc.getImage(); }
      }
      image = image || textRing(untilText(Date.parse(n.kickoff) - NOWMS).split(' ')[0], `${n.home ? 'vs' : '@'}${n.opp}`, 'KICKOFF');
    } else image = gaugeImage(data.odds.playoffs, pct(data.odds.playoffs), 'PLAYOFFS');
    const im = w.addImage(image); im.imageSize = new Size(64, 64); im.centerAlignImage();
    return w;
  }
  w.addAccessoryWidgetBackground = false;
  w.setPadding(2, 4, 2, 4);
  if (ctx.mode === 'live' && g) {
    const s = sides(g, club);
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const col = row.addStack();
    col.layoutVertically();
    lockText(col, `${quarterText(g)}${g.sit && g.sit.poss ? ' · ' + g.sit.poss + ' ball' : ''}`, Font.boldSystemFont(9.5), 0.75);
    lockText(col, `${s.a.abbr} ${s.a.score || 0}`, Font.heavySystemFont(15), 1);
    lockText(col, `${s.h.abbr} ${s.h.score || 0}`, Font.heavySystemFont(15), 0.7);
    row.addSpacer();
    const qbKey = arr((data.top || {})[club]).find((k) => k.startsWith('QB:'));
    const sil = await silhouetteOf(data, qbKey);
    if (sil) { const im = row.addImage(silhouetteFigure(sil, 40, 62)); im.imageSize = new Size(40, 62); }
  } else if (ctx.mode === 'final' && g) {
    const [me, opp] = clubSideFirst(g, club);
    lockText(w, `FINAL · WEEK ${data.week}`, Font.boldSystemFont(10), 0.75);
    lockText(w, `${resultWord(g, club) === 'W' ? 'Win' : 'Loss'} ${me.score}-${opp.score}`, Font.heavySystemFont(17), 1);
    lockText(w, `${me.abbr} ${me.rec || wlText(data.club)} · playoffs ${pct(data.odds.playoffs)}`, Font.mediumSystemFont(11), 0.85);
  } else if (ctx.mode === 'preview' && n) {
    lockText(w, `NEXT · ${kickText(n.kickoff).toUpperCase()}`, Font.boldSystemFont(10), 0.75);
    lockText(w, `${n.home ? 'vs' : '@'} ${tm(n.opp)[0]}`, Font.heavySystemFont(17), 1);
    lockText(w, n.win != null ? `${Math.round(n.win * 100)}% win · ${lineText(data)}` : lineText(data), Font.mediumSystemFont(11), 0.85);
  } else if (ctx.mode === 'offseason') {
    lockText(w, `${data.season} SEASON`, Font.boldSystemFont(10), 0.75);
    lockText(w, `${data.club.name} ${wlText(data.club)}`, Font.heavySystemFont(17), 1);
    lockText(w, SEASON_TAG[data.odds.tag] || 'Season complete', Font.mediumSystemFont(11), 0.85);
  } else {
    lockText(w, `PLAYOFF RACE · ${data.club.conf}`, Font.boldSystemFont(10), 0.75);
    lockText(w, `${club} ${pct(data.odds.playoffs)}`, Font.heavySystemFont(17), 1);
    const sc = data.odds.scenarios && data.odds.scenarios[0];
    lockText(w, sc || (n ? `Next ${n.home ? 'vs' : '@'} ${n.opp} ${kickText(n.kickoff)}` : `${wlText(data.club)}`), Font.mediumSystemFont(11), 0.85, 2);
  }
  w.addSpacer();
  return w;
}

// ---------- main ----------
async function build() {
  const data = await getJson({ path: 'data/nfl/widget.json' }, 'widget.json', 15 * MIN);
  if (!data) return offlineWidget();
  let board = null;
  const club = data.club.abbr;
  const nk = data.next && Date.parse(data.next.kickoff), lk = data.last && Date.parse(data.last.kickoff);
  const windows = arr(data.slate).map((g) => Date.parse(g.kickoff)).concat(nk ? [nk] : []).concat(lk ? [lk] : []);
  const inWindow = windows.some((k) => NOWMS >= k - 30 * MIN && NOWMS <= k + GAME_LEN + FINAL_WINDOW);
  if (FORCE.board || inWindow) board = FORCE.board || (await loadBoard(2 * MIN));
  const ctx = decide(data, board);
  if (ctx.mode === 'live' || ctx.mode === 'final') {
    if (ctx.game) ctx.summary = FORCE.summary || (await loadSummary(ctx.game.id, involves(ctx.game, club) ? 2 * MIN : 5 * MIN));
  }
  const w = await render(data, ctx);
  w.refreshAfterDate = refreshDate(data, ctx);
  if (typeof RV_LOG === 'function') RV_LOG({ mode: ctx.mode, refreshMin: Math.round((w.refreshAfterDate.getTime() - NOWMS) / MIN), style: FAMILY });
  return w;
}
// ---------- offline / no key: the site's error screen (CrashScreen) in miniature ----------
// A night stadium, a jumbotron with bulbs calling the play (TIMEOUT when there's no connection, FLAG when the key is
// missing), the referee's ruling under it, and the yellow flag and the loose ball on the turf. Drawn from primitives only,
// so it works with nothing cached.
const OFF_BALL = ['.....OOOOOO.....', '...OOhhhhhhOO...', '.ObWbbbbbbbbWbO.', 'ObbWbbWbbWbbWbbO', 'ObbWbWWWWWWbWbbO', 'ObbWbbWbbWbbWbbO', '.ObWbbbbbbbbWbO.', '...OObbbbbbOO...', '.....OOOOOO.....'];
const OFF_FLAG = ['......KK......', '.....KKKK.....', 'YYYYYyKKyYYYYY', 'YYYYYYyyYYYYYy', 'YyYYYYYYYYYYYy', 'YYyYYYYYYYYyYY', 'YYYyYYYYYYyYYY', 'YYYYYYYYYYYYYY', '.yyyyyyyyyyyy.'];
const OFF_INK = { O: '#2a140a', b: '#9b5426', h: '#c27a3f', W: '#f6ecd9', Y: '#ffd21f', y: '#d9a300', K: '#3a2a0a' };
function offArt(dc, rows, x, y, px) {
  rows.forEach((row, ry) => [...row].forEach((c, rx) => { if (OFF_INK[c]) R(dc, x + rx * px, y + ry * px, px + 0.05, px + 0.05, new Color(OFF_INK[c])); }));
}
function offlineWidget() {
  const noKey = !TOKEN && !LAN_BASE;
  const word = noKey ? 'FLAG!' : 'TIMEOUT';
  const ruling = noKey ? 'No key on this phone. In Scriptable, run Keychain.set("rv-nfl-token", …) once.' : 'No connection, and nothing saved yet. Play resumes when the phone is back online.';
  const lock = String(FAMILY).startsWith('accessory');
  if (lock) {
    const wd = new ListWidget();
    const t = wd.addText(noKey ? 'RV NFL · Flag: add the key' : 'RV NFL · Timeout: no signal');
    t.font = Font.boldSystemFont(12); t.textColor = Color.white();
    return wd;
  }
  const sz = widgetSize(FAMILY);
  const { w, h } = sz;
  const dc = backgroundCtx(w, h, 'night', 'MIN');
  const small = FAMILY === 'small';
  // floodlight towers in the corners
  for (const tx of [PAD.side, w - PAD.side - 18]) {
    R(dc, tx + 8, 22, 2, small ? 26 : 40, rgba('#3a4466', 1));
    fillRounded(dc, tx, 14, 18, 9, 2, rgba('#20263a', 1));
    for (let i = 0; i < 3; i++) R(dc, tx + 2 + i * 5.5, 16, 3.5, 3.5, rgba('#fff7d6', 0.95));
  }
  // turf band: stripes, yard lines, a chalk sideline
  const turfH = Math.round(h * (small ? 0.3 : 0.27));
  const ty = h - turfH;
  for (let x = 0, i = 0; x < w; x += 22, i++) R(dc, x, ty, 22, turfH, new Color(i % 2 ? '#358a38' : '#2f7d32'));
  for (let x = 11; x < w; x += 44) R(dc, x, ty, 1.5, turfH, rgba('#ffffff', 0.55));
  R(dc, 0, ty, w, 2, rgba('#ffffff', 0.8));
  // the flag and the loose ball on the turf
  const px = small ? 2 : 3;
  offArt(dc, OFF_FLAG, w * 0.24, ty + turfH * 0.38, px);
  offArt(dc, OFF_BALL, w * 0.62, ty + turfH * 0.3, px);
  // the jumbotron
  const bw = Math.min(w - 2 * PAD.side - (small ? 0 : 40), 300), bh = small ? 64 : 84;
  const bx = (w - bw) / 2, by = small ? 30 : 34;
  fillRounded(dc, bx - 3, by - 3, bw + 6, bh + 6, 12, rgba('#2d3550', 1));
  fillRounded(dc, bx, by, bw, bh, 10, rgba('#05070d', 1));
  for (let x = bx + 10; x < bx + bw - 8; x += 9) R(dc, x, by + 5, 3, 3, rgba(HEX.amber, 0.9));
  if (!small) pixCenter(dc, 'RETRO VAULT · LIVE', w / 2, by + 14, 1.2, HEX.dim);
  const wsz = small ? 26 : 38;
  T(dc, word, bx, by + (small ? 16 : 24), bw, wsz, { font: dispI(wsz), color: new Color(noKey ? '#ffd21f' : HEX.live), align: 'center' });
  pixCenter(dc, noKey ? '4TH QTR  0:00  FLAG' : 'NO SIGNAL  0:00  TIMEOUT', w / 2, by + bh - 12, small ? 1 : 1.2, HEX.amber);
  // the stands: rows of fans above the turf, in the club's colours and chalk (deterministic, like the site's crowd)
  const crowdH = small ? 0 : Math.round(h * 0.1);
  if (crowdH) {
    const cy = ty - crowdH;
    R(dc, 0, cy, w, crowdH, new Color('#1b2340'));
    const ink = ['#4F2683', '#FFC62F', '#eef1f8', '#c8946b', '#7a4b2c', '#4F2683'];
    for (let yy = cy + 3, r = 0; yy < ty - 3; yy += 5, r++) for (let xx = 2 + (r % 2) * 3, i = 0; xx < w - 2; xx += 6, i++) R(dc, xx, yy, 3, 3, new Color(ink[(i * 7 + r * 3) % ink.length]));
  }
  // the referee's ruling, wrapped by hand so it never runs off the panel
  if (!small) {
    const ry = by + bh + 12, rw = w - 2 * PAD.side - 12, tw = rw - 20;
    const lines = []; let cur = '';
    for (const word of ruling.split(' ')) { const t = cur ? cur + ' ' + word : word; if (estW(t, 11) > tw && cur) { lines.push(cur); cur = word; } else cur = t; }
    if (cur) lines.push(cur);
    const rh = 14 + lines.length * 15;
    fillRounded(dc, PAD.side + 6, ry - 2, rw, rh + 12, 9, rgba('#080c1a', 0.7));
    pix(dc, "REFEREE'S RULING", PAD.side + 16, ry + 6, 1, HEX.gold);
    lines.forEach((ln, i) => T(dc, ln, PAD.side + 16, ry + 16 + i * 15, tw, 11, { color: C.chalk }));
  }
  finishShell(dc, w, h);
  return newWidget(w, h, dc, null);
}
async function render(data, ctx) {
  const lock = String(FAMILY).startsWith('accessory');
  if (lock && typeof renderLock === 'function') return renderLock(data, ctx);
  if (ctx.mode === 'live') {
    if (FAMILY === 'large') return tickStyle(['classic', 'bug']) === 'bug' ? liveLargeBug(data, ctx) : liveLarge(data, ctx);
    return FAMILY === 'medium' ? liveMedium(data, ctx) : liveSmall(data, ctx);
  }
  if (ctx.mode === 'slate') {
    if (FAMILY === 'large') return tickStyle(['slate', 'bottom']) === 'bottom' ? slateLargeBottom(data, ctx) : slateLarge(data, ctx);
    return FAMILY === 'medium' ? slateMedium(data, ctx) : slateSmall(data, ctx);
  }
  if (ctx.mode === 'final' && ctx.game) return FAMILY === 'large' ? finalLarge(data, ctx) : FAMILY === 'medium' ? finalMedium(data, ctx) : finalSmall(data, ctx);
  if (ctx.mode === 'preview' && data.next) return FAMILY === 'large' ? previewLarge(data) : FAMILY === 'medium' ? previewMedium(data) : previewSmall(data);
  if (ctx.mode === 'final' || ctx.mode === 'slate') ctx.mode = 'between';
  return FAMILY === 'large' ? betweenLarge(data, ctx) : FAMILY === 'medium' ? betweenMedium(data, ctx) : betweenSmall(data, ctx);
}
const widget = await build();
if (config.runsInWidget || typeof RV_FAMILY !== 'undefined') Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
