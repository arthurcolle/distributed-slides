// Build a presentation-only public bundle. The editable investor deck retains
// presenter material locally; this output deliberately carries no scene notes,
// source/provenance strings, or asset-authoring manifest.
import fs from 'node:fs';
import path from 'node:path';
import { buildDeck } from '../src/build.mjs';
import { loadDeck } from '../src/store.mjs';

const deck = loadDeck('distributed-investor');
const publicDeck = JSON.parse(JSON.stringify(deck));
const publicSources = {
  harness: 'DSCO source: https://github.com/arthurcolle/dsco',
  authority: 'DSCO source: https://github.com/arthurcolle/dsco',
  'action-layer': 'Tool Management: https://tools.distributed.systems',
  'intelligence-memory': 'Router: https://router.distributed.systems · GraphSub: https://github.com/arthurcolle/graphsub',
  heat: 'HEAT MCP: https://heat-mcp.distributed.systems/mcp',
  evidence: 'DSCO https://github.com/arthurcolle/dsco · Tools https://tools.distributed.systems · Router https://router.distributed.systems · GraphSub https://github.com/arthurcolle/graphsub'
};
for (const scene of publicDeck.scenes) {
  delete scene.notes;
  scene.source = publicSources[scene.id] || 'Distributed Systems — current product and implementation status.';
  delete scene.cue;
  delete scene.deliveryCue;
  if (scene.type === 'elements') scene.staticReadability = true;
  // Investor viewing is self-guided: essential content must be readable on the
  // first frame. Keep diagram connectors animated, but never stage body copy.
  for (const element of scene.elements || []) delete element.enter;
}
const built = buildDeck(publicDeck);
const index = path.join(built.dist, 'index.html');
const viewerCss = `<style>
.audience{background:#07111a}
.audience .live-column{height:calc(100dvh - 66px);padding:18px 24px 0}
.audience .viewport{width:min(calc(100vw - 48px),calc((100dvh - 84px)*1.777777778));height:min(calc(100dvh - 84px),calc((100vw - 48px)*.5625));border:1px solid rgba(217,183,139,.22);border-radius:8px;box-shadow:0 24px 72px rgba(0,0,0,.42)}
.viewer-nav{position:fixed;left:0;right:0;bottom:0;height:66px;display:flex;align-items:center;justify-content:center;gap:14px;background:rgba(7,17,26,.94);backdrop-filter:blur(14px);border-top:1px solid rgba(217,183,139,.15);color:#d5dde7;font:14px Arial,sans-serif;z-index:50}.viewer-nav button,.viewer-nav a{font:inherit;padding:9px 14px;border:1px solid #526778;background:#101f2d;color:#f6f3eb;border-radius:4px;cursor:pointer;text-decoration:none}.viewer-nav button:focus-visible,.viewer-nav a:focus-visible{outline:2px solid #dfb976;outline-offset:2px}.viewer-nav button:disabled{opacity:.4;cursor:default}#viewer-count{min-width:70px;text-align:center}.rotate-hint{display:none}@media(max-width:480px) and (orientation:portrait){.rotate-hint{display:block;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:51;padding:7px 10px;border:1px solid rgba(217,183,139,.3);border-radius:999px;background:rgba(7,17,26,.9);color:#d5dde7;font:12px Arial,sans-serif;white-space:nowrap}}@media(max-width:480px){.audience .live-column{padding:8px 8px 0}.audience .viewport{width:min(calc(100vw - 16px),calc((100dvh - 74px)*1.777777778));height:min(calc(100dvh - 74px),calc((100vw - 16px)*.5625));border-radius:4px}.viewer-nav{gap:6px;font-size:12px}.viewer-nav button,.viewer-nav a{padding:8px}.viewer-reader{display:none}}
</style>`;
const viewer = `<div class="rotate-hint" role="status">Rotate for larger text</div><nav class="viewer-nav" aria-label="Presentation controls"><button id="viewer-prev" aria-label="Previous slide">← Previous</button><span id="viewer-count" aria-live="polite"></span><button id="viewer-replay" aria-label="Replay animation">Replay</button><button id="viewer-fullscreen" aria-label="View presentation fullscreen">Fullscreen</button><a class="viewer-reader" href="print.html" target="_blank" rel="noopener" aria-label="Open a printable reader view">Reader</a><button id="viewer-next" aria-label="Next slide">Next →</button></nav><script>(()=>{const p=document.querySelector('#viewer-prev'),n=document.querySelector('#viewer-next'),c=document.querySelector('#viewer-count');function u(){const s=window.DS_TEST.getState();c.textContent=(s.index+1)+' / '+s.routeLength;p.disabled=s.index===0;n.disabled=s.index===s.routeLength-1}p.onclick=()=>{window.DS_TEST.navigate(-1);u()};n.onclick=()=>{window.DS_TEST.navigate(1);u()};document.querySelector('#viewer-replay').onclick=()=>document.querySelector('#restart').click();document.querySelector('#viewer-fullscreen').onclick=()=>document.documentElement.requestFullscreen?.();requestAnimationFrame(()=>requestAnimationFrame(()=>window.dispatchEvent(new Event('resize'))));setInterval(u,250);u()})();</script>`;
let html = fs.readFileSync(index, 'utf8');
// Safari can preload stylesheets before parsing a late <base>; establish the
// route first and make the initial runtime files explicit as well.
html = html.replace('<head>', '<head><base href="/deck/">')
  .replace('href="shell.css"', 'href="/deck/shell.css"')
  .replace('href="stage.css"', 'href="/deck/stage.css"')
  .replace('src="content.js"', 'src="/deck/content.js"')
  .replace('src="engine.js"', 'src="/deck/engine.js"')
  .replace('src="shell.js"', 'src="/deck/shell.js"')
  .replace('src="remote.js"', 'src="/deck/remote.js"')
  .replace('</head>', `${viewerCss}</head>`)
  .replace('<body>', `<body><script>const deckUrl=new URL(location.href);deckUrl.searchParams.set('audience','1');history.replaceState(null,'',deckUrl);</script>`)
  .replace('</body>', `${viewer}</body>`);
fs.writeFileSync(index, html);
fs.rmSync(path.join(built.dist, 'assets', 'SOURCES.md'), { force: true });
console.log(JSON.stringify({ dist: built.dist, scenes: publicDeck.scenes.length, public: true }));
