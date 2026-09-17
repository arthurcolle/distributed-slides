import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_DIR, assetsDir, distDir } from './store.mjs';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function indexHtml(deck) {
  const shellTheme = deck.theme && deck.theme.shell ? deck.theme.shell : {};
  const vars = Object.entries({
    navy: shellTheme.bg, paper: shellTheme.fg, blue: shellTheme.blue, gold: shellTheme.gold,
    line: shellTheme.line, quiet: shellTheme.quiet, 'font-body': (deck.theme || {}).fontBody, 'font-mono': (deck.theme || {}).fontMono,
  }).filter(([, v]) => v).map(([k, v]) => `--${k}:${v}`).join(';');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(deck.title)}</title><link rel="stylesheet" href="shell.css"><link rel="stylesheet" href="stage.css">${vars ? `<style>:root{${vars}}</style>` : ''}</head>
<body><script>if(new URLSearchParams(location.search).has('audience')||new URLSearchParams(location.search).has('screen'))document.body.classList.add('audience');</script><header class="desk-header"><div class="brand">${esc(deck.brand)}<span>${esc(deck.brandTag)}</span></div><div class="route-controls"><label for="route">RUN OF SHOW</label><select id="route"></select><button id="index-open">Scene index <kbd>L</kbd></button></div><div class="clock-stack"><span id="elapsed">00:00</span><small id="target">REHEARSAL CLOCK</small></div><button id="timer-start">Start clock</button><button id="present" class="primary">Open audience window <kbd>P</kbd></button></header>
<main class="workspace"><section class="live-column"><div class="scene-context"><span id="chapter"></span><span id="scene-counter"></span></div><div id="viewport" class="viewport"><div id="stage" class="scene-frame"></div><div id="blackout" hidden></div></div><div class="media-controls"><button id="play" aria-label="Play or pause animation">Play</button><button id="restart" aria-label="Replay animation">Replay <kbd>R</kbd></button><input id="scrub" aria-label="Animation progress" type="range" min="0" max="1000" value="0"><output id="media-time">00:00 / 00:00</output><select id="speed" aria-label="Animation speed"><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div><nav class="navigation"><button id="previous">Previous <kbd>←</kbd></button><button id="next" class="primary">Next scene <kbd>→</kbd></button><button id="original">Original slide <kbd>O</kbd></button><button id="blackout-toggle">Blackout <kbd>B</kbd></button><button id="share-screen" title="Hide notes and fill this screen before sharing your desktop. Stop sharing, then press Q to restore notes.">Share this screen</button><button id="fullscreen">Full screen <kbd>F</kbd></button><span id="connection">Audience window closed</span></nav><details class="provenance"><summary>Source and interpretation</summary><p id="source"></p><p id="source-warning">${esc(deck.footer)}</p><p><a href="print.html" target="_blank" rel="noopener">Storyboard — print or save as PDF</a> · a static, notes-free copy for anyone without this app</p></details><p class="shortcuts">Arrow keys or Page Up / Page Down change scenes. Space plays or pauses. The audience window never displays these notes. For desktop sharing, use <strong>Share this screen</strong>; press Q to restore notes.</p></section>
<aside class="cue-panel"><div class="cue-heading">PRIVATE PRESENTER VIEW</div><div class="next-label"><span>UP NEXT</span><span id="next-number"></span></div><div class="next-preview"><div id="next-stage"></div></div><h2 id="next-title"></h2><div class="transition"><span>SAY THIS TO TRANSITION</span><p id="transition"></p></div><div class="notes-heading"><h2>What to say now</h2><button id="copy-notes">Copy</button></div><div id="notes" tabindex="0"></div><div class="notes-footer"><span id="pacing"></span></div></aside></main>
<div id="audience-hint" hidden>Audience view. Press F for full screen. Arrow keys advance the talk.</div>
<dialog id="scene-dialog"><header><h2>The run of show</h2><button data-close="scene-dialog">Close</button></header><input id="scene-search" type="search" placeholder="Find a subject or scene…" aria-label="Search scenes"><div id="scene-list"></div></dialog>
<div id="toast" role="status" hidden></div><script src="content.js"></script><script src="engine.js"></script><script src="shell.js"></script><script src="remote.js"></script></body></html>
`;
}

// A static, offline storyboard: every scene frozen at its resolved reduced-motion
// frame, stacked as one page per scene with CSS break-after so a browser's own
// Print > Save as PDF produces a real multi-page PDF — no server, no Playwright.
function printHtml(deck) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(deck.title)} — storyboard</title>
<link rel="stylesheet" href="stage.css">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
html,body{margin:0;background:#333}
.page{width:1600px;height:900px;position:relative;overflow:hidden;background:#0a1521;page-break-after:always;break-after:page;margin:0 auto 18px}
.page:last-child{page-break-after:avoid;break-after:avoid;margin-bottom:0}
.cap{position:absolute;left:0;right:0;bottom:0;z-index:5;background:#000000b3;color:#cbd5df;font:13px Menlo,monospace;padding:8px 18px;display:flex;justify-content:space-between;gap:20px}
.cap b{color:#f6f3eb;font-weight:600;font-family:-apple-system,'Segoe UI',sans-serif;font-size:14px}
.notes{position:absolute;left:0;right:0;bottom:38px;z-index:5;background:#000000d0;color:#e7d7b8;font:13px/1.5 Georgia,serif;padding:12px 18px;white-space:pre-line}
@media print{html,body{background:#fff}.page{margin:0}}
</style></head>
<body>
<script src="content.js"></script><script src="engine.js"></script>
<script>
const notesOn = new URLSearchParams(location.search).has('notes');
DECK.scenes.forEach((s, i) => {
  const page = document.createElement('div'); page.className = 'page';
  const stage = document.createElement('div'); stage.style.cssText = 'width:1600px;height:900px;position:relative';
  page.append(stage);
  try {
    const h = DS.mount(stage, s, DECK);
    if (h.media) { stage.replaceChildren(); if (s.poster) { const img = document.createElement('img'); img.src = s.poster; img.style.cssText = 'width:1600px;height:900px;object-fit:contain;display:block'; stage.append(img); } }
    else h.update(s.duration, false);
  } catch (e) { stage.textContent = 'Scene "' + s.id + '" failed: ' + e.message; }
  const cap = document.createElement('div'); cap.className = 'cap';
  cap.innerHTML = '<span>' + String(i + 1).padStart(2, '0') + ' / ' + DECK.scenes.length + (s.chapter ? ' — ' + s.chapter : '') + '</span><b>' + (s.title || s.id) + '</b>';
  page.append(cap);
  if (notesOn && s.notes) { const n = document.createElement('div'); n.className = 'notes'; n.textContent = s.notes; page.append(n); }
  document.body.append(page);
});
document.body.dataset.ready = 'true';
</script>
</body></html>
`;
}

export function buildDeck(deck) {
  const out = distDir(deck.id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of ['shell.css', 'stage.css', 'engine.js', 'shell.js', 'remote.js']) {
    fs.copyFileSync(path.join(RUNTIME_DIR, f), path.join(out, f));
  }
  fs.writeFileSync(path.join(out, 'content.js'), 'window.DECK=' + JSON.stringify(deck) + ';\n');
  fs.writeFileSync(path.join(out, 'index.html'), indexHtml(deck));
  fs.writeFileSync(path.join(out, 'print.html'), printHtml(deck));
  const assets = assetsDir(deck.id);
  if (fs.existsSync(assets)) fs.cpSync(assets, path.join(out, 'assets'), { recursive: true });
  const bytes = fs.readdirSync(out, { recursive: true }).reduce((total, f) => {
    const p = path.join(out, String(f));
    return total + (fs.statSync(p).isFile() ? fs.statSync(p).size : 0);
  }, 0);
  return { dist: out, entry: path.join(out, 'index.html'), printEntry: path.join(out, 'print.html'), scenes: deck.scenes.length, routes: Object.keys(deck.routes), bytes };
}
