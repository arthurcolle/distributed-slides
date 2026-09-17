// Capture animated GIFs of scenes by scrubbing the deterministic clock frame
// by frame — the same mechanism the audience-sync uses, so GIFs are exact.
// Usage: node scripts/capture-gifs.mjs  (requires local Chrome + ffmpeg)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW_DIR = process.env.PLAYWRIGHT_DIR || '/Users/arthurcolle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const require = createRequire(path.join(PW_DIR, 'x.js'));
const { chromium } = require('playwright');

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

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
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
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
    '-vf', `scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    '-loop', '0', out], { stdio: 'ignore' });
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(shot.name + '.gif', Math.round(fs.statSync(out).size / 1024) + 'KB');
}
await browser.close();
server.kill();
