/* Distributed-Slides presenter shell.
   Presenter window drives a deterministic clock; the audience window mirrors it
   over postMessage with a per-session token. Notes never reach the audience. */
(() => {
'use strict';
const D = window.DECK, $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const audience = params.has('audience');
const token = params.get('session') || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let screenSharing = params.has('screen');
const audienceTitle = (D.title || 'Distributed Slides') + ' | Audience';

const sceneMap = new Map(D.scenes.map(s => [s.id, s]));
const routes = Object.keys(D.routes || {}).length ? { ...D.routes } : {};
routes.complete = D.scenes.map(s => s.id);
const routeLabels = D.routeLabels || {};
let routeName = routes[params.get('route')] ? params.get('route') : (routes[D.defaultRoute] ? D.defaultRoute : Object.keys(routes)[0]);
let route = routes[routeName].slice(), index = 0, scene = null, handle = null, video = null;
let position = 0, playing = false, speed = 1, original = false, black = false;
let peer = null, lastTick = performance.now(), lastSent = 0, timerStart = null, timerStopped = 0, sceneStart = performance.now();
let motionEnabled = !matchMedia('(prefers-reduced-motion:reduce)').matches;

const animated = s => s.type !== undefined; // every scene type is clock-driven
const mm = s => `${Math.floor(Math.max(0, s) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, s) % 60).toString().padStart(2, '0')}`;
function updateTitle() { document.title = audience ? audienceTitle : screenSharing ? (D.title || '') + ' | Screen' : (D.brand || 'DS') + ' / ' + (scene ? scene.title : ''); }
const hasPresenter = () => audience && window.opener && !window.opener.closed;
function control(action, value) { if (!hasPresenter()) return false; window.opener.postMessage({ kind: 'ds-control', token, action, value }, '*'); return true; }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 3500); }
function htmlNode(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; }

function resize() { const v = $('viewport'); $('stage').style.transform = `scale(${v.clientWidth / 1600})`; }
new ResizeObserver(resize).observe($('viewport'));

function display(s) {
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  scene = s; video = null;
  const stage = $('stage');
  stage.replaceChildren();
  if (original && s.originalImage) {
    const img = htmlNode('img'); img.src = s.originalImage; img.alt = s.title; stage.append(img); handle = null;
  } else {
    handle = window.DS.mount(stage, s, D);
    if (handle.media) {
      video = handle.media;
      video.playbackRate = speed;
      video.addEventListener('error', () => toast('Media could not load. Keep the assets folder next to index.html.'));
      video.addEventListener('loadedmetadata', () => {
        if (handle && handle.media !== video) return;
        video.currentTime = Math.min(position, video.duration - .05);
        video.playbackRate = speed;
        if (playing) video.play().catch(() => {});
      });
    }
  }
  $('chapter').textContent = s.chapter || '';
  $('source').textContent = s.source || '';
  $('notes').textContent = s.notes || '';
  let cueEl = $('delivery-cue');
  if (!cueEl) { cueEl = htmlNode('p', 'delivery-cue'); cueEl.id = 'delivery-cue'; document.querySelector('.notes-heading').before(cueEl); }
  cueEl.textContent = s.deliveryCue || 'Let the scene settle, then make the connection in your own words.';
  $('scene-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${route.length}`;
  $('original').disabled = !s.originalImage;
  $('original').textContent = original ? 'Designed scene O' : 'Original slide O';
  for (const id of ['play', 'restart', 'scrub', 'speed']) $(id).disabled = original;
  $('scrub').value = Math.round(position / s.duration * 1000);
  if (handle) handle.update(position, motionEnabled);
  updateNext();
  resize();
  updateTitle();
}

function updateNext() {
  const next = sceneMap.get(route[index + 1]);
  $('next-title').textContent = next ? next.title : 'Questions and discussion';
  $('next-number').textContent = next ? `${index + 2} / ${route.length}` : 'END';
  $('transition').textContent = (next && next.cue) || 'Thank you. I would be happy to take questions.';
  const holder = $('next-stage');
  holder.replaceChildren();
  if (next) {
    // Live miniature mount frozen near its end state: no prerendered previews needed.
    const mini = htmlNode('div', 'mini-stage');
    holder.append(mini);
    try {
      const h = window.DS.mount(mini, next, D);
      if (h.media) { h.media.removeAttribute('src'); if (next.poster) { mini.replaceChildren(); const img = htmlNode('img'); img.src = next.poster; mini.append(img); } }
      else h.update(next.duration * .55, true);
    } catch { /* preview is best-effort */ }
  }
  $('next').disabled = index === route.length - 1;
  $('previous').disabled = index === 0;
}

function go(delta) {
  if (control('go', delta)) return;
  index = Math.max(0, Math.min(route.length - 1, index + delta));
  position = 0; original = false;
  sceneStart = lastTick = performance.now();
  const s = sceneMap.get(route[index]);
  playing = motionEnabled;
  display(s);
  location.hash = s.id;
  send(true);
}
function seek(value) {
  lastTick = performance.now();
  position = Math.max(0, Math.min(scene.duration, value));
  if (video && video.readyState) video.currentTime = Math.min(position, video.duration - .01);
  send(true);
}
function toggle() {
  if (control('toggle')) return;
  advance(performance.now());
  if (position >= scene.duration - .1) seek(0);
  playing = !playing;
  if (video) playing ? video.play().catch(() => {}) : video.pause();
  send(true);
}
function state() { return { kind: 'ds-state', token, id: scene.id, routeName, index, position, playing, speed, original, black, motionEnabled, sentAt: Date.now() }; }
function send(force = false) {
  if (audience) return;
  if (peer && !peer.closed && (force || performance.now() - lastSent > 220)) {
    peer.postMessage(state(), '*');
    lastSent = performance.now();
    $('connection').textContent = 'Audience window connected';
  } else if (!peer || peer.closed) $('connection').textContent = 'Audience window closed';
}

window.addEventListener('message', e => {
  if (!e.data || e.data.token !== token) return;
  if (audience) {
    if (e.source !== window.opener || e.data.kind !== 'ds-state') return;
    const d = e.data, s = sceneMap.get(d.id);
    if (!s) return;
    const changed = !scene || scene.id !== d.id || original !== d.original;
    routeName = routes[d.routeName] ? d.routeName : routeName;
    route = routes[routeName].slice();
    index = d.index;
    $('route').value = routeName;
    lastTick = performance.now();
    position = Math.min(s.duration, d.position + (d.playing && !d.original ? Math.max(0, Date.now() - d.sentAt) / 1000 * d.speed : 0));
    playing = d.playing; speed = d.speed; original = d.original; black = d.black; motionEnabled = d.motionEnabled !== false;
    if (changed) display(s);
    $('blackout').hidden = !black;
    if (video && video.readyState) {
      if (Math.abs(video.currentTime - position) > .4) video.currentTime = Math.min(position, video.duration - .01);
      video.playbackRate = speed;
      playing ? video.play().catch(() => {}) : video.pause();
    }
  } else {
    if (e.source !== peer) return;
    if (e.data.kind === 'ds-ready') send(true);
    if (e.data.kind === 'ds-control') {
      const d = e.data;
      if (d.action === 'go') go(d.value);
      if (d.action === 'toggle') toggle();
      if (d.action === 'blackout') $('blackout-toggle').click();
      if (d.action === 'restart') $('restart').click();
      if (d.action === 'original') $('original').click();
      if (d.action === 'home') { index = 0; go(0); }
      if (d.action === 'end') { index = route.length - 1; go(0); }
    }
  }
});

function openAudience() {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ audience: '1', session: token, route: routeName }).toString();
  url.hash = scene.id;
  peer = window.open(url.href, 'ds-audience-' + token, 'popup=yes,width=1440,height=810');
  if (!peer) toast('Allow this page to open its audience window, then press P again.');
  else { toast('Share only the Audience window. Keep it open and unminimized.'); send(true); }
}
function full() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => toast('Use the browser’s full-screen command.'));
  else toast('Use the browser’s full-screen command.');
}
function shareScreen() {
  if (audience) return;
  screenSharing = true;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  document.body.classList.add('audience');
  $('audience-hint').hidden = true;
  const url = new URL(location.href);
  url.searchParams.set('screen', '1'); url.searchParams.set('route', routeName);
  history.replaceState(null, '', url);
  document.activeElement?.blur();
  updateTitle(); resize();
  if (!document.fullscreenElement) full();
}
function returnToDesk() {
  if (audience || !screenSharing) return;
  screenSharing = false;
  document.body.classList.remove('audience');
  const url = new URL(location.href);
  url.searchParams.delete('screen');
  history.replaceState(null, '', url);
  updateTitle(); resize();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function list() {
  if (audience || screenSharing) return;
  const host = $('scene-list');
  host.replaceChildren();
  route.map(id => sceneMap.get(id)).forEach((s, i) => {
    const b = htmlNode('button', 'list-item');
    b.dataset.search = `${s.title} ${s.chapter || ''} ${s.type} ${i + 1}`.toLowerCase();
    b.setAttribute('aria-current', String(s.id === scene.id));
    const mini = htmlNode('div', 'mini-stage list-mini');
    try { const h = window.DS.mount(mini, s, D); if (!h.media) h.update(s.duration * .55, true); else if (s.poster) { mini.replaceChildren(); const img = htmlNode('img'); img.src = s.poster; mini.append(img); } } catch {}
    b.append(mini, htmlNode('small', '', `${String(i + 1).padStart(2, '0')} / ${s.chapter || s.type}`), htmlNode('strong', '', s.title || s.id));
    b.onclick = () => { $('scene-dialog').close(); index = i; go(0); };
    host.append(b);
  });
  $('scene-dialog').showModal();
  $('scene-search').focus();
}
$('scene-search').oninput = e => { for (const n of $('scene-list').children) n.hidden = !n.dataset.search.includes(e.target.value.toLowerCase()); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());

$('next').onclick = () => go(1);
$('previous').onclick = () => go(-1);
$('play').onclick = toggle;
$('restart').onclick = () => { if (control('restart')) return; seek(0); playing = true; if (video) video.play().catch(() => {}); send(true); };
$('scrub').oninput = e => seek(+e.target.value / 1000 * scene.duration);
$('speed').onchange = e => { speed = +e.target.value; if (video) video.playbackRate = speed; send(true); };
$('original').onclick = () => { if (control('original')) return; if (!scene.originalImage) return; original = !original; display(scene); send(true); };
$('blackout-toggle').onclick = () => { if (control('blackout')) return; black = !black; $('blackout').hidden = !black; send(true); };
$('present').onclick = openAudience;
$('share-screen').onclick = shareScreen;
$('fullscreen').onclick = full;
$('index-open').onclick = list;
$('timer-start').onclick = () => {
  if (timerStart === null) { timerStart = performance.now(); $('timer-start').textContent = 'Pause clock'; }
  else { timerStopped += (performance.now() - timerStart) / 1000; timerStart = null; $('timer-start').textContent = 'Resume clock'; }
};
$('route').onchange = e => {
  const id = scene.id;
  routeName = e.target.value;
  route = routes[routeName].slice();
  index = Math.max(0, route.indexOf(id));
  go(0);
  toast(route.length + ' scenes.');
};
$('copy-notes').onclick = () => navigator.clipboard?.writeText(scene.notes || '').then(() => toast('Speaking notes copied.')).catch(() => toast('Select the notes to copy them.'));

document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (['arrowright', 'arrowdown', 'pagedown'].includes(key)) { e.preventDefault(); go(1); }
  else if (['arrowleft', 'arrowup', 'pageup'].includes(key)) { e.preventDefault(); go(-1); }
  else if (key === ' ') { e.preventDefault(); toggle(); }
  else if (key === 'f') { e.preventDefault(); full(); }
  else if (key === 'p' && !audience && !screenSharing) openAudience();
  else if (key === 'q' && screenSharing) returnToDesk();
  else if (key === 'r') $('restart').click();
  else if (key === 'b') $('blackout-toggle').click();
  else if (key === 'o') $('original').click();
  else if (key === 'l' && !audience) list();
  else if (key === 'n' && !audience && !screenSharing) { document.body.classList.toggle('cues-hidden'); resize(); }
  else if (key === 'home') { if (!control('home')) { index = 0; go(0); } }
  else if (key === 'end') { if (!control('end')) { index = route.length - 1; go(0); } }
});

function advance(now) {
  const dt = Math.max(0, (now - lastTick) / 1000);
  lastTick = now;
  if (playing && !original && (!video || (video.readyState >= 2 && !video.seeking))) {
    position = Math.min(scene.duration, position + dt * speed);
    if (position >= scene.duration) { playing = false; if (video) video.pause(); }
  }
}
function tick(now) {
  advance(now);
  if (video && video.readyState >= 2 && !video.seeking) {
    const target = Math.max(0, Math.min(position, video.duration - .01));
    if (Math.abs(video.currentTime - target) > .25) video.currentTime = target;
    if (playing && video.paused) video.play().catch(() => {});
    if (!playing && !video.paused) video.pause();
  }
  if (handle) handle.update(position, motionEnabled);
  $('play').textContent = playing ? 'Pause' : 'Play';
  $('scrub').value = Math.round(position / scene.duration * 1000);
  $('media-time').textContent = original ? 'ORIGINAL SLIDE' : `${mm(position)} / ${mm(scene.duration)}`;
  $('elapsed').textContent = mm(timerStopped + (timerStart === null ? 0 : (now - timerStart) / 1000));
  $('pacing').textContent = `Scene ${mm((now - sceneStart) / 1000)} / cue ${D.rehearsalCueSeconds || scene.duration}s`;
  send();
  requestAnimationFrame(tick);
}

if (audience || screenSharing) document.body.classList.add('audience');
// Route dropdown from the deck spec.
for (const name of Object.keys(routes)) {
  const o = htmlNode('option', '', (routeLabels[name] || name.replace(/-/g, ' ')) + ' / ' + routes[name].length + ' scenes');
  o.value = name;
  $('route').append(o);
}
$('route').value = routeName;
setInterval(() => { if (!audience && document.hidden && peer && !peer.closed) { advance(performance.now()); send(true); } }, 250);
const hash = location.hash.slice(1);
if (sceneMap.has(hash)) {
  if (route.includes(hash)) index = route.indexOf(hash);
  else { routeName = 'complete'; route = routes.complete.slice(); index = Math.max(0, route.indexOf(hash)); $('route').value = routeName; }
}
playing = motionEnabled;
display(sceneMap.get(route[index]));
lastTick = performance.now();
requestAnimationFrame(tick);
if (hasPresenter()) window.opener.postMessage({ kind: 'ds-ready', token }, '*');

window.DS_TEST = {
  getState: () => ({ id: scene.id, index, position, playing, routeName, routeLength: route.length, black, original, motionEnabled, motionObjects: handle ? handle.count : 0 }),
  goTo: id => { if (!route.includes(id)) { routeName = 'complete'; route = routes.complete.slice(); $('route').value = 'complete'; } index = route.indexOf(id); go(0); },
  seek, navigate: go, toggle, fullscreen: full, openAudience, getPeer: () => peer,
  blackout: () => $('blackout-toggle').click(), shareScreen, returnToDesk,
  setMotion: v => { motionEnabled = v; if (handle) handle.update(position, motionEnabled); send(true); },
};
})();
