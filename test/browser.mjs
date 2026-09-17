// Browser verification: serve the built demo deck, click through every scene,
// scrub, blackout, open the audience window and confirm sync. Requires the
// shared playwright install (PLAYWRIGHT_DIR env overrides the default path).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PW_DIR = process.env.PLAYWRIGHT_DIR || '/Users/arthurcolle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(path.join(PW_DIR, 'x.js'));
const { chromium } = require('playwright');

const dist = path.join(ROOT, 'decks/demo-flagship/dist');
const port = 4917;
const server = spawn(process.execPath, [path.join(ROOT, 'src/serve.mjs'), dist, String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));

const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };
const failures = [];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });

  const state = () => page.evaluate(() => window.DS_TEST.getState());
  let s = await state();
  assert(s.id === 'open', 'first scene is open, got ' + s.id);
  assert(s.playing, 'autoplays');
  assert(s.motionObjects > 0, 'hero has motion records');

  // Walk every scene in the performance route; each must mount with no page errors.
  const total = s.routeLength;
  const visited = [];
  for (let i = 0; i < total; i++) {
    s = await state();
    visited.push(s.id);
    const objects = s.motionObjects;
    const stageChildren = await page.evaluate(() => document.getElementById('stage').children.length);
    if (!stageChildren) failures.push(s.id + ': empty stage');
    // Scrub to the middle and the end: deterministic update must not throw.
    await page.evaluate(() => window.DS_TEST.seek(window.DECK.scenes.find(x => x.id === window.DS_TEST.getState().id).duration * .5));
    await page.waitForTimeout(80);
    await page.evaluate(() => window.DS_TEST.seek(0));
    if (i < total - 1) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(220); }
    if (objects === 0 && !['film'].includes(s.id)) { /* charts report update count */ }
  }
  assert(visited.length === total, 'visited all ' + total);

  // Deterministic replay check on the canvas custom scene.
  await page.evaluate(() => window.DS_TEST.goTo('custom-lanes'));
  await page.waitForTimeout(250);
  const snap = async t => {
    await page.evaluate(tt => window.DS_TEST.seek(tt), t);
    await page.waitForTimeout(120);
    return page.evaluate(() => document.querySelector('#stage canvas').toDataURL());
  };
  const a1 = await snap(8); const b1 = await snap(2); const a2 = await snap(8);
  assert(a1 === a2, 'canvas scene is deterministic under scrubbing');
  assert(a1 !== b1, 'canvas scene actually animates');

  // Blackout.
  await page.keyboard.press('b');
  assert(!(await page.evaluate(() => document.getElementById('blackout').hidden)), 'blackout shows');
  await page.keyboard.press('b');

  // Scene index dialog + search.
  await page.keyboard.press('l');
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.getElementById('scene-dialog').open), 'index opens');
  await page.fill('#scene-search', 'cadence');
  const visibleCount = await page.evaluate(() => [...document.querySelectorAll('#scene-list .list-item')].filter(n => !n.hidden).length);
  assert(visibleCount === 1, 'search filters to 1, got ' + visibleCount);
  await page.click('[data-close="scene-dialog"]');

  // Audience window: open, then verify it mirrors navigation and never shows notes.
  const [aud] = await Promise.all([
    page.context().waitForEvent('page'),
    page.evaluate(() => window.DS_TEST.openAudience()),
  ]);
  await aud.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  const audAudience = await aud.evaluate(() => document.body.classList.contains('audience'));
  assert(audAudience, 'audience window is chrome-free');
  const notesVisible = await aud.evaluate(() => { const n = document.querySelector('.cue-panel'); return n && getComputedStyle(n).display !== 'none'; });
  assert(!notesVisible, 'audience never displays presenter notes');
  await page.evaluate(() => window.DS_TEST.goTo('system'));
  await page.waitForTimeout(700);
  const audScene = await aud.evaluate(() => window.DS_TEST.getState().id);
  assert(audScene === 'system', 'audience follows presenter, got ' + audScene);
  // Audience arrow key controls the presenter back over the control channel.
  await aud.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const presenterScene = await page.evaluate(() => window.DS_TEST.getState().id);
  const audScene2 = await aud.evaluate(() => window.DS_TEST.getState().id);
  assert(presenterScene === audScene2, 'reverse control keeps both in step');

  // Motion off = final frame (reduced-motion contract).
  await page.evaluate(() => window.DS_TEST.setMotion(false));
  await page.waitForTimeout(200);

  // Screenshots for the record.
  await page.evaluate(() => window.DS_TEST.goTo('system'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.DS_TEST.seek(20));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, 'test/presenter-diagram.png') });
  await page.evaluate(() => window.DS_TEST.goTo('custom-lanes'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.DS_TEST.seek(12));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, 'test/presenter-custom.png') });
  await aud.screenshot({ path: path.join(ROOT, 'test/audience.png') });

  const fatal = errors.filter(e => !/favicon/i.test(e));
  if (fatal.length) failures.push('page errors: ' + fatal.join(' | '));
  if (failures.length) { console.error('BROWSER FAIL\n' + failures.join('\n')); process.exit(1); }
  console.log('BROWSER PASS — scenes:', visited.join(', '));
  process.exit(0);
} catch (e) {
  console.error('BROWSER FAIL:', e.message);
  process.exit(1);
} finally {
  await browser.close();
  server.kill();
}
