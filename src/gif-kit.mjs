// Shared headless-browser and ffmpeg helpers for export tooling. Playwright and
// ffmpeg are optional — only needed for export_gifs/export_pdf, never for the
// server or the compiled deck itself.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PKG_ROOT } from './store.mjs';

const INSTALL_HINT = 'Run: npm install -D playwright && npx playwright install chromium\n' +
  '(Or set PLAYWRIGHT_DIR to an existing Playwright install.)';

export function checkFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

export function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR, PKG_ROOT, process.cwd()].filter(Boolean);
  for (const base of candidates) {
    try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* try next */ }
  }
  throw new Error('Playwright is not installed. GIF/PDF export needs a headless browser.\n' + INSTALL_HINT);
}

// Try, in order: an explicit override, Playwright's "chrome" channel (auto-detects
// an installed system Chrome/Chromium with no hardcoded path — the documented,
// portable way to reuse a browser that's already on the machine), then
// Playwright's own managed download. Only fails if none of the three exist.
export async function launchChromium(chromium, opts = {}) {
  if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH, ...opts });
  try { return await chromium.launch({ channel: 'chrome', ...opts }); } catch { /* fall through */ }
  try { return await chromium.launch(opts); } catch (e) {
    throw new Error(
      'No headless browser available. Any one of these fixes it:\n' +
      '  - Install Google Chrome (Playwright will auto-detect it via channel:"chrome")\n' +
      '  - Run: npx playwright install chromium (downloads a managed browser)\n' +
      '  - Set CHROME_PATH to any Chromium/Chrome executable\n\nOriginal error: ' + e.message,
    );
  }
}

export function encodeGif(framesDir, outFile, { fps = 10, width = 480 } = {}) {
  if (!checkFfmpeg()) throw new Error('ffmpeg is not on PATH. Install it (e.g. `brew install ffmpeg` or `apt install ffmpeg`) to export GIFs.');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(framesDir, 'f%04d.png'),
    '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
    '-loop', '0', outFile], { stdio: 'ignore' });
  return outFile;
}
