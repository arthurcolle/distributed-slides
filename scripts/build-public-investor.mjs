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
}
const built = buildDeck(publicDeck);
const index = path.join(built.dist, 'index.html');
const viewerCss = `<style>
.audience .live-column{height:calc(100dvh - 66px)}
.audience .viewport{width:min(100vw,calc((100dvh - 66px)*1.777777778));height:min(calc(100dvh - 66px),56.25vw)}
.viewer-nav{position:fixed;left:0;right:0;bottom:0;height:66px;display:flex;align-items:center;justify-content:center;gap:14px;background:#0a1521;color:#d5dde7;font:14px Arial,sans-serif;z-index:50}.viewer-nav button{font:inherit;padding:9px 14px;border:1px solid #526778;background:#101f2d;color:#f6f3eb;border-radius:4px;cursor:pointer}.viewer-nav button:focus-visible{outline:2px solid #dfb976;outline-offset:2px}.viewer-nav button:disabled{opacity:.4;cursor:default}#viewer-count{min-width:70px;text-align:center}@media(max-width:480px){.viewer-nav{gap:6px;font-size:12px}.viewer-nav button{padding:8px}}
</style>`;
const viewer = `<nav class="viewer-nav" aria-label="Presentation controls"><button id="viewer-prev" aria-label="Previous slide">← Previous</button><span id="viewer-count" aria-live="polite"></span><button id="viewer-replay" aria-label="Replay animation">Replay</button><button id="viewer-next" aria-label="Next slide">Next →</button></nav><script>(()=>{const p=document.querySelector('#viewer-prev'),n=document.querySelector('#viewer-next'),c=document.querySelector('#viewer-count');function u(){const s=window.DS_TEST.getState();c.textContent=(s.index+1)+' / '+s.routeLength;p.disabled=s.index===0;n.disabled=s.index===s.routeLength-1}p.onclick=()=>{window.DS_TEST.navigate(-1);u()};n.onclick=()=>{window.DS_TEST.navigate(1);u()};document.querySelector('#viewer-replay').onclick=()=>document.querySelector('#restart').click();setInterval(u,250);u()})();</script>`;
let html = fs.readFileSync(index, 'utf8');
html = html.replace('</head>', `${viewerCss}</head>`)
  .replace('<body>', `<body><script>const deckUrl=new URL(location.href);deckUrl.searchParams.set('audience','1');history.replaceState(null,'',deckUrl);</script>`)
  .replace('</body>', `${viewer}</body>`);
fs.writeFileSync(index, html);
fs.rmSync(path.join(built.dist, 'assets', 'SOURCES.md'), { force: true });
console.log(JSON.stringify({ dist: built.dist, scenes: publicDeck.scenes.length, public: true }));
