// RV NFL widget forwarder. This repository (sakisaki-dev/rv-nfl-widget) is archived: the widget now lives in
// github.com/sakisaki-dev/RetroVault-NFL (widget code in public/widgets/, daily data on its widget-data branch).
// Phones installed before the move still fetch THIS file; it fetches the current widget code from the new home
// (raw GitHub, then GitHub Pages, then the last good copy) and runs it, so the installed widget keeps updating with no
// change on the phone. Fresh installs should paste rv-nfl-install.js from the new repo instead.
const URLS = ['https://raw.githubusercontent.com/sakisaki-dev/RetroVault-NFL/main/public/widgets/rv-nfl-widget.js', 'https://sakisaki-dev.github.io/RetroVault-NFL/widgets/rv-nfl-widget.js'];
const fm = FileManager.local();
const cached = fm.joinPath(fm.documentsDirectory(), 'rv-nfl-widget-forward-cache.js');
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
