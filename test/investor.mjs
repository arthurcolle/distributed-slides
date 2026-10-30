import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {loadDeck} from '../src/store.mjs';
import {buildDeck} from '../src/build.mjs';
import {validateDeck} from '../src/schema.mjs';
import {loadPlaywright,launchChromium} from '../src/gif-kit.mjs';
const deck=loadDeck('distributed-investor');
assert.deepEqual(validateDeck(deck).filter(p=>p.level==='error'),[]);
assert(!JSON.stringify(deck).includes('97%'));
const built=buildDeck(deck),port=4918;
const server=spawn(process.execPath,['src/serve.mjs',built.dist,String(port)],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,500));
const {chromium}=loadPlaywright();let browser;
try{
 browser=await launchChromium(chromium);
 const page=await browser.newPage({viewport:{width:1600,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'networkidle'});
 const captures=process.env.CAPTURE_DIR;if(captures)fs.mkdirSync(captures,{recursive:true});
 for(const scene of deck.scenes){
  await page.evaluate(id=>window.DS_TEST.goTo(id),scene.id);
  await page.waitForTimeout(50);
  await page.evaluate(t=>window.DS_TEST.seek(t),scene.duration);
  assert.equal(await page.locator('.ds-error').count(),0,scene.id+' renders');
  assert(await page.locator('#stage').innerText() || await page.locator('#stage svg').count(),scene.id+' nonempty');
  if(captures)await page.locator('#viewport').screenshot({path:path.join(captures,scene.id+'.png')});
 }
 // Same time yields same picture, including reverse seeking.
 await page.evaluate(()=>window.DS_TEST.goTo('shared-stack'));
 const snap=async t=>{
  await page.evaluate(async t=>{
   if(window.DS_TEST.getState().playing) document.querySelector('#play').click();
   window.DS_TEST.seek(t);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },t);
  return await page.locator('#viewport').screenshot();
 };
 const a=await snap(8),b=await snap(1),a2=await snap(8);
 assert(a.equals(a2),'custom scene scrubs deterministically');assert(!a.equals(b),'scene visibly animates');
 await page.keyboard.press('l');assert(await page.locator('#scene-dialog').evaluate(e=>e.open));
 await page.click('[data-close="scene-dialog"]');assert(!(await page.locator('#scene-dialog').evaluate(e=>e.open)));
 const [aud]=await Promise.all([page.context().waitForEvent('page'),page.evaluate(()=>window.DS_TEST.openAudience())]);
 await aud.waitForLoadState('networkidle');await page.waitForTimeout(200);
 assert.equal(await aud.locator('.cue-panel').isVisible(),false,'audience hides notes');
 await page.evaluate(()=>window.DS_TEST.goTo('heat'));await page.waitForTimeout(300);
 assert.equal(await aud.evaluate(()=>window.DS_TEST.getState().id),'heat');
 await aud.keyboard.press('ArrowRight');await page.waitForTimeout(250);
 assert.equal(await aud.evaluate(()=>window.DS_TEST.getState().id),await page.evaluate(()=>window.DS_TEST.getState().id));
 const reduced=await browser.newPage({reducedMotion:'reduce'});
 await reduced.goto(`http://127.0.0.1:${port}/print.html`,{waitUntil:'networkidle'});
 assert.equal(await reduced.locator('.page').count(),16);
 assert.equal(await reduced.locator('.ds-error').count(),0);
 assert.equal(await reduced.locator('.notes').count(),0,'storyboard hides notes');
 assert.deepEqual(errors,[]);
 console.log('PASS: 16 scenes, schema, deterministic motion, scene index close, audience sync/privacy, reduced-motion storyboard, no unsupported 97% claim');
}finally{if(browser)await browser.close();server.kill();}
