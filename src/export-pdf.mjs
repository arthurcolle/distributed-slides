#!/usr/bin/env node
// Automates what a human could also do by hand: open dist/print.html and
// Print > Save as PDF. This just drives that same page headlessly.
// CLI: node src/export-pdf.mjs <deck-id> [--notes]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { loadDeck } from './store.mjs';
import { buildDeck } from './build.mjs';
import { loadPlaywright, launchChromium } from './gif-kit.mjs';

export async function exportPdf(deckId, opts = {}) {
  const deck = loadDeck(deckId);
  const built = buildDeck(deck);
  const { chromium } = loadPlaywright();
  const browser = await launchChromium(chromium);
  const outFile = opts.outFile || path.join(built.dist, 'storyboard.pdf');
  try {
    const page = await browser.newPage();
    const url = pathToFileURL(built.printEntry).href + (opts.notes ? '?notes=1' : '');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 30000 });
    await page.pdf({ path: outFile, width: '1600px', height: '900px', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    await browser.close();
  }
  return { file: outFile, pages: deck.scenes.length, bytes: fs.statSync(outFile).size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [deckId, ...rest] = process.argv.slice(2);
  if (!deckId) { console.error('Usage: node src/export-pdf.mjs <deck-id> [--notes]'); process.exit(1); }
  exportPdf(deckId, { notes: rest.includes('--notes') }).then(r => {
    console.log(`Exported ${r.pages} pages to ${r.file} (${(r.bytes / 1024 / 1024).toFixed(1)} MB)`);
  }).catch(e => { console.error('Export failed:', e.message); process.exit(1); });
}
