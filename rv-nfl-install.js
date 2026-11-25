// Retro Vault NFL widget for Scriptable: paste this once into a new Scriptable script and name it "RV NFL".
// On every refresh it downloads the latest widget code from github.com/sakisaki-dev/RetroVault-NFL (public; raw GitHub,
// then GitHub Pages) and keeps the last good copy for offline use, so the widget updates itself whenever new code or data is published.
// Then add a Scriptable widget (any size, or a lock screen one) and choose this script. No key needed.

// raw GitHub first, then the same file on GitHub Pages
const URLS = ['https://raw.githubusercontent.com/sakisaki-dev/RetroVault-NFL/main/public/widgets/rv-nfl-widget.js', 'https://sakisaki-dev.github.io/RetroVault-NFL/widgets/rv-nfl-widget.js'];
const fm = FileManager.local();
const cached = fm.joinPath(fm.documentsDirectory(), 'rv-nfl-widget-cache.js');
let code = null;
for (const url of URLS) {
  try {
    const r = new Request(url);
    r.timeoutInterval = 12;
    const text = await r.loadString();
    if (!/^\s*</.test(text) && text.includes('ListWidget')) { code = text; fm.writeString(cached, code); break; }
  } catch (e) {
    /* the next source; offline: use the cached copy */
  }
}
if (!code && fm.fileExists(cached)) code = fm.readString(cached);
if (!code) {
  const w = new ListWidget();
  w.backgroundColor = new Color('#0a0f1e');
  const t = w.addText('RV NFL · Timeout: no connection yet');
  t.textColor = new Color('#ffd84a');
  t.font = Font.boldSystemFont(13);
  Script.setWidget(w);
  Script.complete();
} else {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(code)();
}
