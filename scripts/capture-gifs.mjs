// Maintainer script: captures the five README GIFs by scrubbing the
// deterministic clock frame by frame — the same mechanism the audience-sync
// uses, so these GIFs are exact. For exporting a whole deck's GIFs, see
// src/export-gifs.mjs / the export_gifs MCP tool instead.
// Usage: node scripts/capture-gifs.mjs  (requires Playwright + ffmpeg)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, launchChromium, encodeGif } from '../src/gif-kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = loadPlaywright();

const SHOTS = [
  { scene: 'native-lanes', from: 2, to: 14, name: 'lanes' },
  { scene: 'system', from: 1, to: 13, name: 'diagram' },
  { scene: 'cat-globe', from: 1, to: 13, name: 'globe' },
  { scene: 'cat-race', from: 0, to: 12, name: 'race' },
  { scene: 'cat-terminal', from: 0, to: 12, name: 'terminal' },
];
const FPS = 12, W = 880, H = 495;

const dist = path.join(ROOT, 'decks/demo-flagship/dist');
const port = 4941;
const server = spawn(process.execPath, [path.join(ROOT, 'src/serve.mjs'), dist, String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });

const browser = await launchChromium(chromium);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/?screen=1`, { waitUntil: 'networkidle' });
for (const shot of SHOTS) {
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-gif-'));
  await page.evaluate(id => window.DS_TEST.goTo(id), shot.scene);
  await page.waitForTimeout(400);
  const n = Math.round((shot.to - shot.from) * FPS);
  for (let f = 0; f <= n; f++) {
    await page.evaluate(t => window.DS_TEST.seek(t), shot.from + f / FPS);
    await page.waitForTimeout(30);
    await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.png`) });
  }
  const out = path.join(ROOT, 'docs', shot.name + '.gif');
  encodeGif(frames, out, { fps: FPS, width: W });
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(shot.name + '.gif', Math.round(fs.statSync(out).size / 1024) + 'KB');
}
await browser.close();
server.kill();
