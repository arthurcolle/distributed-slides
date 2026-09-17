#!/usr/bin/env node
// Export a GIF per scene from ANY already-built presentation that exposes a
// goTo(id)/seek(seconds) test API — Distributed-Slides' own DS_TEST, or the
// original bespoke HEAT_TEST this project was extracted from. Generic on
// purpose: point it at a static folder, tell it how to enumerate scenes.
//
// Usage:
//   node scripts/export-any-gifs.mjs --dir=<path> --api=HEAT_TEST \
//     --scenes="AO.performance.map(id=>{const s=AO.scenes.find(x=>x.id===id);return {id,title:s.title,chapter:s.chapter,duration:s.duration}})" \
//     [--out=<path>] [--fps=8] [--width=440] [--seconds=8]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { serveDir } from '../src/serve.mjs';
import { loadPlaywright, launchChromium, encodeGif } from '../src/gif-kit.mjs';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function galleryHtml(title, manifest) {
  const cards = manifest.map(m => `
  <figure>
    <img src="${esc(m.file)}" alt="${esc(m.title)}" loading="lazy">
    <figcaption><span>${esc(m.chapter || '')}</span><strong>${esc(m.title)}</strong></figcaption>
  </figure>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — GIF copy</title>
<style>
:root{--bg:#0a1521;--fg:#f6f3eb;--muted:#a4b3c3;--gold:#d5ad66;--line:#2b3947}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,'Segoe UI',sans-serif;padding:48px 32px 80px}
h1{font-size:28px;font-weight:600;margin:0 0 6px}
p.sub{color:var(--muted);margin:0 0 40px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px}
figure{margin:0;border:1px solid var(--line);background:#0d1c2b}
figure img{width:100%;display:block}
figcaption{padding:11px 13px}
figcaption span{display:block;font-size:10px;letter-spacing:1.4px;color:var(--gold);text-transform:uppercase;margin-bottom:4px}
figcaption strong{font-size:13.5px;font-weight:500}
</style></head>
<body>
<h1>${esc(title)}</h1>
<p class="sub">${manifest.length} scenes, exported by scrubbing each scene's own deterministic clock.</p>
<div class="grid">${cards}</div>
</body></html>`;
}

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv) {
    const m = arg.match(/^--([\w-]+)=([\s\S]+)$/);
    if (m) opts[m[1]] = m[2];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.dir || !opts.scenes) {
    console.error('Usage: node scripts/export-any-gifs.mjs --dir=<path> --scenes="<js expr returning [{id,title,chapter,duration}]>" [--api=DS_TEST] [--out=<path>] [--fps=8] [--width=440] [--seconds=8] [--only=id1,id2]');
    process.exit(1);
  }
  const dir = path.resolve(opts.dir);
  const api = opts.api || 'DS_TEST';
  const outDir = opts.out ? path.resolve(opts.out) : path.join(dir, 'gifs');
  const fps = Number(opts.fps) || 8;
  const width = Number(opts.width) || 440;
  const maxSeconds = Number(opts.seconds) || 8;
  const only = opts.only ? new Set(opts.only.split(',')) : null;

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = loadPlaywright();
  const { server, port } = await serveDir(dir, 0);
  const browser = await launchChromium(chromium);
  const warnings = [];
  const manifest = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 563 } });
    await page.goto(`http://127.0.0.1:${port}/?screen=1`, { waitUntil: 'networkidle' });
    let scenes = await page.evaluate(expr => eval(expr), opts.scenes);
    if (only) scenes = scenes.filter(s => only.has(s.id));
    console.log(`Exporting ${scenes.length} scenes from ${dir}`);
    let i = 0;
    for (const scene of scenes) {
      i++;
      const seconds = Math.max(.5, Math.min(scene.duration || maxSeconds, maxSeconds));
      const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-export-'));
      try {
        await page.evaluate(([a, id]) => window[a].goTo(id), [api, scene.id]);
        await page.waitForTimeout(350);
        const n = Math.max(1, Math.round(seconds * fps));
        for (let f = 0; f <= n; f++) {
          await page.evaluate(([a, t]) => window[a].seek(t), [api, (f / n) * seconds]);
          await page.waitForTimeout(35);
          await page.screenshot({ path: path.join(frameDir, `f${String(f).padStart(4, '0')}.png`) });
        }
        const file = path.join(outDir, scene.id + '.gif');
        encodeGif(frameDir, file, { fps, width });
        manifest.push({ ...scene, file: scene.id + '.gif', bytes: fs.statSync(file).size });
        console.log(`[${i}/${scenes.length}] ${scene.id} -> ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
      } catch (e) {
        warnings.push(`${scene.id}: ${e.message}`);
        console.log(`[${i}/${scenes.length}] ${scene.id} FAILED: ${e.message}`);
      } finally {
        fs.rmSync(frameDir, { recursive: true, force: true });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ dir, generatedAt: new Date().toISOString(), scenes: manifest }, null, 2));
  fs.writeFileSync(path.join(outDir, 'index.html'), galleryHtml(path.basename(dir), manifest));
  console.log(`\nDone: ${manifest.length}/${manifest.length + warnings.length} exported to ${outDir}`);
  console.log(`Total size: ${(manifest.reduce((t, m) => t + m.bytes, 0) / 1024 / 1024).toFixed(1)} MB`);
  if (warnings.length) console.log('Warnings:\n' + warnings.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
