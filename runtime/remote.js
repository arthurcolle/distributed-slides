/* Presenter-remote hardening: one press = one scene, learnable button mapping,
   clicker self-test dialog. Works with any remote that emits keyboard events. */
(() => {
'use strict';
const $ = s => document.getElementById(s), api = window.DS_TEST, audience = new URLSearchParams(location.search).has('audience'), keys = new Set();
let armed = true, learn = null, forward = 0, back = 0, mapping = {};
try { mapping = JSON.parse(localStorage.getItem('ds-remote-map-v1') || '{}'); } catch {}
const signature = e => [e.ctrlKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.metaKey ? 'Meta' : '', e.key].filter(Boolean).join('+');
const tools = document.createElement('div');
tools.className = 'remote-tools';
tools.innerHTML = '<button id="remote-arm" aria-pressed="true">Remote armed</button><button id="remote-open">Clicker test</button><button id="motion-toggle" aria-pressed="true">Motion on</button><small>One press = one scene. Holding a button never races ahead.</small>';
if (!audience) $('viewport').parentElement.querySelector('.navigation').after(tools);
const dialog = document.createElement('dialog');
dialog.id = 'remote-dialog';
dialog.innerHTML = `<header><h2>Check your clicker</h2><button id="remote-close">Done</button></header><div class="remote-layout"><div class="remote-test-pad"><div>Press the remote's Next and Back buttons.</div><strong id="remote-last">Listening…</strong><div id="remote-log" aria-live="polite">No button presses yet.</div><div class="remote-meter"><span>Next: <b id="remote-forward">0</b></span><span>Back: <b id="remote-back">0</b></span></div><p id="remote-status">Both directions need a button press.</p></div><div class="remote-copy"><h3>Your talk will stay on the current scene.</h3><p>The test listens for keyboard events from the connected remote or keyboard. Test with the actual clicker in your hand.</p><p>Default support includes Right/Left arrows and Page Down/Page Up. If your remote sends something different, teach those two buttons here.</p><button id="learn-next">Learn Next</button><button id="learn-back">Learn Back</button><button id="reset-remote">Reset mapping</button><p id="mapping-status"></p><p>Connect the receiver or pair over Bluetooth. Keep this presentation window focused.</p></div></div>`;
document.body.append(dialog);
function updateMapping() { $('mapping-status').textContent = 'Custom mapping: Next ' + (mapping.next || 'default') + ' / Back ' + (mapping.back || 'default'); try { localStorage.setItem('ds-remote-map-v1', JSON.stringify(mapping)); } catch {} }
function direction(e) {
  const sig = signature(e);
  if (armed && mapping.next === sig) return 1;
  if (armed && mapping.back === sig) return -1;
  if (e.metaKey || e.ctrlKey || e.altKey) return 0;
  if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) return 1;
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) return -1;
  return 0;
}
function test(e) {
  const sig = signature(e);
  $('remote-last').textContent = e.key;
  $('remote-log').textContent = sig + ' / code ' + (e.code || 'not supplied');
  if (learn) {
    if (e.metaKey || e.ctrlKey || e.altKey) { $('remote-status').textContent = 'Choose a simple key, without a system shortcut.'; return; }
    const other = learn === 'next' ? 'back' : 'next';
    if (mapping[other] === sig) { $('remote-status').textContent = 'Next and Back need different buttons.'; return; }
    mapping[learn] = sig; learn = null; updateMapping();
  }
  const d = direction(e);
  if (d === 1) forward++;
  if (d === -1) back++;
  $('remote-forward').textContent = forward;
  $('remote-back').textContent = back;
  $('remote-status').textContent = forward && back ? 'Both directions received. Press Done to return to the talk.' : d ? 'Now press the other direction.' : 'Unmapped input. Use Learn Next or Learn Back if this is a navigation button.';
}
if (!audience) {
  $('remote-open').onclick = () => { learn = null; forward = 0; back = 0; $('remote-forward').textContent = '0'; $('remote-back').textContent = '0'; $('remote-last').textContent = 'Listening…'; $('remote-status').textContent = 'Both directions need a button press.'; updateMapping(); dialog.showModal(); $('remote-close').focus(); };
  $('remote-close').onclick = () => { dialog.close(); $('remote-open').blur(); };
  $('learn-next').onclick = () => { learn = 'next'; $('remote-status').textContent = 'Press the button you want to advance one scene.'; };
  $('learn-back').onclick = () => { learn = 'back'; $('remote-status').textContent = 'Press the button you want to go back one scene.'; };
  $('reset-remote').onclick = () => { mapping = {}; updateMapping(); $('remote-status').textContent = 'Default arrows and Page Up/Down restored.'; };
  $('remote-arm').onclick = () => { armed = !armed; $('remote-arm').setAttribute('aria-pressed', String(armed)); $('remote-arm').textContent = armed ? 'Remote armed' : 'Remote off'; document.body.classList.toggle('remote-armed', armed); };
  $('motion-toggle').onclick = () => { const enabled = !api.getState().motionEnabled; api.setMotion(enabled); $('motion-toggle').textContent = enabled ? 'Motion on' : 'Motion off'; $('motion-toggle').setAttribute('aria-pressed', String(enabled)); $('motion-toggle').blur(); };
  $('motion-toggle').textContent = api.getState().motionEnabled ? 'Motion on' : 'Motion off';
  $('motion-toggle').setAttribute('aria-pressed', String(api.getState().motionEnabled));
  document.body.classList.add('remote-armed');
}
const consume = e => { e.preventDefault(); e.stopImmediatePropagation(); };
window.addEventListener('keyup', e => keys.delete(e.code || e.key), true);
window.addEventListener('blur', () => keys.clear());
window.addEventListener('keydown', e => {
  const id = e.code || e.key;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Fn'].includes(e.key)) return;
  if (dialog.open) {
    if (e.key === 'Escape') { learn = null; return; }
    if (e.key === 'Tab' || (!learn && ['Enter', ' '].includes(e.key) && e.target.matches?.('button,a'))) return;
    consume(e);
    if (!e.repeat && !keys.has(id)) { keys.add(id); test(e); }
    return;
  }
  const textEntry = e.target.matches?.('textarea,input:not([type=range]):not([type=button]),[contenteditable=true]');
  if (textEntry || document.querySelector('dialog[open]')) return;
  const d = direction(e), navigation = d !== 0;
  if (navigation) {
    if (!armed && e.target.matches?.('input,select')) return;
    consume(e);
    if (e.repeat || keys.has(id)) return;
    keys.add(id);
    api.navigate(d);
    return;
  }
  if (e.key === 'F5' || (e.key === 'Enter' && e.metaKey && e.shiftKey)) { consume(e); if (!e.repeat) api.fullscreen(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { consume(e); if (!e.repeat && !keys.has(id)) { keys.add(id); api.toggle(); } return; }
  if (k === 'b' || k === '.') { consume(e); if (!e.repeat && !keys.has(id)) { keys.add(id); api.blackout(); } return; }
  if (k === 'f') { consume(e); if (!e.repeat) api.fullscreen(); return; }
  if (e.repeat && ['r', 'o', 'p', 'n', 'home', 'end'].includes(k)) { consume(e); return; }
}, true);
window.DS_REMOTE = { getState: () => ({ armed, mapping: { ...mapping }, forward, back, learning: learn }), open: () => $('remote-open').click() };
})();
