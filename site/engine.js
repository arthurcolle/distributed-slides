/* Distributed-Slides scene engine.
   Contract: DS.mount(stage, scene, deck) -> {update(seconds, motionEnabled), count, media?}
   Every animation is a pure function of the presenter clock. Nothing accumulates
   between frames, so scrubbing, playback speed and audience sync are exact. */
(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const mix = (a, b, p) => a + (b - a) * p;
const fmt = (v, d = 1) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
const lerpColor = (a, b, p) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = shift => Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * clamp(p));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const measure = document.createElement('canvas').getContext('2d');

const DARK = { bg:'#0a1521', fg:'#f6f3eb', muted:'#aabccb', line:'#30495e', panel:'#101f2d', blue:'#8eb6fc', gold:'#dfb976', red:'#f4a17c', green:'#7bc4af', amber:'#f5a975' };
const LIGHT = { bg:'#f6f3eb', fg:'#172d3b', muted:'#526778', line:'#bfccd2', panel:'#edf0eb', blue:'#245da3', gold:'#946324', red:'#a64b2b', green:'#387469', amber:'#a64c22' };

function palette(scene, deck) {
  const theme = deck.theme || {};
  const base = Object.assign({}, scene.light ? LIGHT : DARK, scene.light ? theme.light : theme.dark, scene.palette);
  base.fontBody = theme.fontBody || "'Avenir Next',Avenir,'Segoe UI',sans-serif";
  base.fontMono = theme.fontMono || 'Menlo,monospace';
  return base;
}
const node = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

/* ---------- SVG scene scaffold: chrome + primitive kit shared by diagram/chart/custom ---------- */
function svgScene(host, s, deck) {
  const C = palette(s, deck);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', (s.title || s.id) + (s.footnote ? '. ' + s.footnote : ''));
  svg.classList.add('ds-scene');
  svg.dataset.scene = s.id;
  host.append(svg);
  const updates = [], enters = [];
  const el = (tag, attrs = {}, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); parent.append(e); return e; };
  const rect = (x, y, w, h, fill = C.panel, stroke = C.line, parent = svg) => el('rect', { x, y, width: w, height: h, fill, stroke, 'stroke-width': stroke === 'none' ? 0 : 1.2 }, parent);
  const line = (x1, y1, x2, y2, color = C.line, width = 1, parent = svg) => el('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': width }, parent);
  const dot = (x, y, r, color = C.gold, parent = svg) => el('circle', { cx: x, cy: y, r, fill: color }, parent);
  const group = (delay = 0) => { const g = el('g'); enters.push({ g, delay }); return g; };
  function wrapRows(str, width, size, weight, mono) {
    measure.font = `${weight} ${size}px ${mono ? C.fontMono : C.fontBody}`;
    const rows = [];
    for (const para of String(str).split('\n')) {
      let acc = '';
      for (const word of para.split(/\s+/)) {
        if (acc && measure.measureText(acc + ' ' + word).width > width) { rows.push(acc); acc = word; }
        else acc += (acc ? ' ' : '') + word;
      }
      rows.push(acc);
    }
    return rows;
  }
  function text(str, x, y, w, size = 25, color = C.fg, parent = svg, mono = false, weight = 400, leading = 1.22, anchor = 'start') {
    const rows = wrapRows(str, w, size, weight, mono);
    const e = el('text', { x, y, fill: color, 'font-family': mono ? C.fontMono : C.fontBody, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor, 'data-width': w }, parent);
    rows.forEach((r, i) => { const span = el('tspan', { x, dy: i ? size * leading : 0 }, e); span.textContent = r; });
    e._rows = rows.length; e._height = rows.length * size * leading;
    return e;
  }
  const small = (v, x, y, w = 600, color = C.muted, parent = svg) => text(v, x, y, w, 16, color, parent, false, 600);
  const value = (v, x, y, w = 400, color = C.fg, parent = svg, size = 66) => text(v, x, y, w, size, color, parent, true, 400);
  const change = (e, v) => { if (e.textContent !== String(v)) { e.replaceChildren(); e.textContent = v; } };
  function box(x, y, w, h, title, body, tone = 'blue', delay = 0) {
    const g = group(delay);
    rect(x, y, w, h, C.panel, C.line, g);
    line(x, y, x, y + h, C[tone] || C.blue, 4, g);
    text(title, x + 22, y + 38, w - 44, 27, C.fg, g, false, 600);
    if (body) text(body, x + 22, y + 84, w - 44, 22, C.muted, g);
    return g;
  }
  // Animated flow: quiet base path + colored draw-on + a dot that travels the path once.
  function flow(points, start = 0, color = C.blue, width = 3) {
    const d = points.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' ');
    const base = el('path', { d, stroke: C.line, fill: 'none', 'stroke-width': 2 });
    const p = el('path', { d, stroke: color, fill: 'none', 'stroke-width': width });
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    const a = dot(points[0][0], points[0][1], 5, color);
    updates.push((t, on) => {
      const tt = on ? t : s.duration;
      p.style.strokeDashoffset = String(len * (1 - clamp((tt - start) / 1.5)));
      const q = base.getPointAtLength(clamp((tt - start) / 3) * len);
      a.setAttribute('cx', q.x); a.setAttribute('cy', q.y);
      a.style.opacity = on && t >= start && t < start + 3 ? '1' : '0';
    });
    return p;
  }
  const markers = {};
  function arrowMarker(tone) {
    if (markers[tone]) return markers[tone];
    let defs = svg.querySelector('defs') || el('defs');
    const id = 'ds-' + s.id + '-' + tone;
    const m = el('marker', { id, markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M 0 0 L 8 4 L 0 8', fill: 'none', stroke: C[tone] || C.line, 'stroke-width': 1.7 }, m);
    return markers[tone] = id;
  }
  const chrome = s.chrome !== false;
  if (chrome) {
    rect(0, 0, 1600, 900, C.bg, 'none');
    small((deck.brand || 'DISTRIBUTED SLIDES') + (s.kicker ? ' / ' + s.kicker : s.chapter ? ' / ' + s.chapter.toUpperCase() : ''), 65, 46, 900);
    if (s.badge || deck.badge) text(s.badge || deck.badge, 1535, 46, 470, 16, C.muted, svg, false, 600, 1.2, 'end');
    const title = text(s.title || '', 65, 109, 1465, 45, C.fg, svg, false, 500, 1.1);
    if (s.subtitle) text(s.subtitle, 65, title._rows === 1 ? 158 : 204, 1465, 23, C.muted);
    line(65, 226, 1535, 226);
  } else rect(0, 0, 1600, 900, C.bg, 'none');
  let captionGroups = [];
  function finish() {
    const phases = Array.isArray(s.phases) ? s.phases : [];
    if (chrome) {
      line(65, 774, 1535, 774);
      captionGroups = phases.map((p, i) => {
        const g = el('g', { 'data-caption': i });
        value('0' + (i + 1), 65, 816, 78, C.gold, g, 29);
        text(p.title, 145, 815, 1380, 27, C.fg, g, false, 500);
        if (p.body) text(p.body, 145, 851, 1380, 21, C.muted, g);
        return g;
      });
      if (s.footnote) text(s.footnote, 65, 884, 1470, 14, C.muted);
    }
    const n = Math.max(1, captionGroups.length || (phases.length || 3));
    function update(seconds, enabled = true) {
      const t = enabled ? seconds : s.duration;
      const phase = Math.min(n - 1, Math.floor(clamp(t / s.duration) * n));
      svg.dataset.position = seconds.toFixed(3);
      svg.dataset.phase = phase;
      svg.dataset.motion = String(enabled);
      enters.forEach(({ g, delay }) => g.style.opacity = String(.28 + .72 * clamp((t - delay) / .8)));
      updates.forEach(fn => fn(t, enabled, phase));
      captionGroups.forEach((g, i) => g.style.opacity = i === phase ? '1' : '0');
    }
    update(0, true);
    return { update, count: updates.length + enters.length };
  }
  return { svg, C, el, rect, line, dot, group, text, small, value, change, box, flow, arrowMarker, updates, enters, finish, phaseCount: () => Math.max(1, (s.phases || []).length || 3) };
}

/* ---------- hero ---------- */
function hero(stage, s, deck) {
  const C = palette(s, deck);
  if (s.art) { const img = node('img', 'hero-art'); img.src = s.art; img.alt = 'Conceptual artwork'; stage.append(img); }
  else { const bgEl = node('div', 'hero-art'); bgEl.style.background = `radial-gradient(120% 140% at 82% 12%, ${C.panel} 0%, ${C.bg} 55%, #05090f 100%)`; stage.append(bgEl); }
  stage.append(node('div', 'hero-shade'));
  const copy = node('div', 'hero-copy');
  const eyebrow = node('p', 'eyebrow', ''); eyebrow.textContent = s.eyebrow || deck.brand || '';
  const h1 = node('h1'); h1.textContent = s.title;
  const sub = node('p', 'hero-subtitle'); sub.textContent = s.subtitle || '';
  copy.append(eyebrow, h1, sub);
  stage.append(copy);
  if (s.credit) stage.append(node('div', 'hero-credit', s.credit));
  const records = [
    ['.hero-art', 0, 1.4, 'art'], ['.eyebrow', .12, .7, 'rise'], ['h1', .3, 1.1, 'rise'],
    ['.hero-subtitle', 1.1, 1, 'rise'], ['.hero-credit', 0, .5, 'fade'],
  ].map(([sel, delay, duration, mode]) => { const el = stage.querySelector(sel); return el ? { el, delay, duration, mode } : null; }).filter(Boolean);
  return animateRecords(records, s);
}

/* ---------- statement ---------- */
function statement(stage, s, deck) {
  const C = palette(s, deck);
  const wrap = node('div', 'statement' + (s.align === 'left' ? ' statement-left' : ''));
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  const eyebrow = node('p', 'eyebrow', s.eyebrow || ''); eyebrow.style.color = C.gold;
  const h1 = node('h1'); h1.textContent = s.title;
  const body = node('p', 'statement-body', s.body || ''); body.style.color = C.muted;
  wrap.append(eyebrow, h1, body);
  stage.append(wrap);
  const records = [
    { el: eyebrow, delay: .1, duration: .7, mode: 'rise' },
    { el: h1, delay: .35, duration: 1.1, mode: 'rise' },
    { el: body, delay: 1.2, duration: 1, mode: 'rise' },
  ];
  return animateRecords(records, s);
}

/* ---------- image ---------- */
function image(stage, s) {
  const img = node('img', 'still');
  img.src = s.src; img.alt = s.title || '';
  if (s.fit === 'cover') img.style.objectFit = 'cover';
  stage.append(img);
  const records = [{ el: img, delay: 0, duration: 1.2, mode: 'art' }];
  if (s.caption) { const cap = node('div', 'still-caption', s.caption); stage.append(cap); records.push({ el: cap, delay: .8, duration: .8, mode: 'rise' }); }
  return animateRecords(records, s);
}

/* ---------- film (shell drives the media element) ---------- */
function film(stage, s) {
  const video = node('video');
  video.src = s.src;
  if (s.poster) video.poster = s.poster;
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  video.setAttribute('aria-label', s.title || 'Film');
  stage.append(video);
  return { media: video, count: 1, update() {} };
}

/* ---------- canvas kit: shared by the data engines and custom canvas scenes ---------- */
function canvasKit(g, C) {
  const h = {
    clamp, mix, ease, fmt,
    txt(x, y, t, size = 20, color = C.fg, font, weight = 400, align = 'left') { g.fillStyle = color; g.font = `${weight} ${size}px ${font || C.fontBody}`; g.textAlign = align; g.fillText(String(t), x, y); },
    wrapped(x, y, t, width, size = 40, color = C.fg, lineHeight = 1.15) {
      g.font = `500 ${size}px ${C.fontBody}`;
      let row = '', n = 0;
      for (const w of String(t).split(/\s+/)) {
        if (g.measureText(row + ' ' + w).width > width && row) { h.txt(x, y + n++ * size * lineHeight, row, size, color, C.fontBody, 500); row = w; }
        else row += (row ? ' ' : '') + w;
      }
      h.txt(x, y + n * size * lineHeight, row, size, color, C.fontBody, 500);
      return y + (n + 1) * size * lineHeight;
    },
    ln(a, b, color = C.line, width = 1) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.strokeStyle = color; g.lineWidth = width; g.stroke(); },
    dot(p, r, color) { g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); },
  };
  return h;
}
function canvasScene(stage, s, deck, draw) {
  const canvas = node('canvas');
  canvas.width = 1600; canvas.height = 900;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', (s.title || s.id) + (s.footnote ? '. ' + s.footnote : ''));
  stage.append(canvas);
  const g = canvas.getContext('2d');
  const C = palette(s, deck);
  const h = canvasKit(g, C);
  let last = -1;
  const update = (t, enabled = true) => {
    const tt = enabled ? Math.min(t, s.duration) : s.duration;
    if (tt === last) return;
    last = tt;
    g.clearRect(0, 0, 1600, 900);
    g.fillStyle = C.bg; g.fillRect(0, 0, 1600, 900);
    draw(g, tt, C, h);
  };
  update(0, true);
  return { update, count: 1 };
}
const hhmm = m => `${Math.floor(m / 60).toString().padStart(2, '0')}:${Math.floor(m % 60).toString().padStart(2, '0')}`;
const asof = (xs, t) => { let l = 0, r = xs.length - 1, k = -1; while (l <= r) { const q = (l + r) >> 1; if (xs[q].minute <= t) { k = q; l = q + 1; } else r = q - 1; } return k < 0 ? null : xs[k]; };
function canvasChrome(g, C, h, s, deck, clockText, unit) {
  h.txt(65, 48, (deck.brand || 'DISTRIBUTED SLIDES') + (s.kicker ? ' / ' + s.kicker : ''), 16, C.muted, C.fontBody, 600);
  if (s.chapter) h.txt(65, 85, s.chapter.toUpperCase(), 12, C.gold, C.fontBody, 600);
  h.wrapped(65, 141, s.title || '', 1220, 43);
  if (s.subtitle) h.txt(65, 215, s.subtitle, 19, C.muted);
  if (clockText) { h.txt(1534, 135, clockText, 39, C.fg, C.fontMono, 400, 'right'); h.txt(1534, 166, unit || '', 12, C.muted, C.fontBody, 400, 'right'); }
  h.ln([65, 238], [1535, 238], C.line);
  h.ln([65, 843], [1535, 843], C.line);
  if (s.footnote) h.txt(65, 874, s.footnote, 14, C.muted);
  if (s.badge || deck.badge) h.txt(1535, 874, s.badge || deck.badge, 12, C.gold, C.fontBody, 500, 'right');
}
const sceneData = (s, deck, key) => s[key] || Object.assign({}, deck.data, s.data)[s.dataRef || key];

/* ---------- lanes: multi-lane time series in perspective (the price topography) ---------- */
function lanesScene(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    const m = sceneData(s, deck, 'lanes');
    const n = m.labels.length, xMax = m.xMax || 1440;
    const T = clamp(t / Math.max(1, s.duration - 4)) * xMax;
    canvasChrome(g, C, h, s, deck, hhmm(T), m.clockUnit || 'LOCAL STANDARD TIME');
    const val = v => (m.format || '{v}').replace('{v}', fmt(v * (m.scale ?? 100), m.decimals ?? 1));
    const cur = asof(m.states, T);
    let best = -1;
    if (cur) cur.values.forEach((q, i) => { if (q !== null && q !== undefined && (best < 0 || q > cur.values[best])) best = i; });
    if (s.flat) {
      const rowH = Math.min(61, 480 / n - 17), gap = rowH + 17, x = 210, y = 297, w = 1040;
      for (let b = 0; b < n; b++) {
        h.txt(70, y + b * gap + rowH * .62, m.labels[b], 18, C.fg);
        g.fillStyle = '#152435'; g.fillRect(x, y + b * gap, w, rowH);
        for (const q of m.states) {
          if (q.minute > T) break;
          const value = q.values[b];
          if (value === null || value === undefined) continue;
          g.fillStyle = `rgb(${Math.round(18 + 100 * value)},${Math.round(34 + 124 * value)},${Math.round(55 + 189 * value)})`;
          g.fillRect(x + q.minute / xMax * w, y + b * gap, w / xMax + 1, rowH);
        }
      }
      h.ln([210 + T / xMax * w, y - 5], [210 + T / xMax * w, y + (n - 1) * gap + rowH], C.gold, 2);
      for (let q = 0; q <= 4; q++) h.txt(x + q / 4 * w, 802, hhmm(xMax * q / 4), 15, C.muted, C.fontMono, 400, 'center');
      h.txt(730, 828, m.flatCaption || 'Dark low / bright high / missing values are unpainted', 15, C.muted, C.fontBody, 400, 'center');
    } else {
      const bx = Math.min(43, 258 / Math.max(1, n - 1)), by = Math.min(49, 294 / Math.max(1, n - 1));
      const P = (minute, value, b) => [110 + minute / xMax * 880 + b * bx, 770 - b * by - value * 240];
      for (let b = n - 1; b >= 0; b--) {
        for (const q of [0, .5, 1]) h.ln(P(0, q, b), P(xMax, q, b), q === 0 ? '#496078' : '#203449');
        for (let q = 0; q <= 4; q++) h.ln(P(xMax * q / 4, 0, b), P(xMax * q / 4, 1, b), '#1c3043');
        h.txt(P(xMax, 0, b)[0] + 15, P(xMax, 0, b)[1] + 6, m.labels[b], 18, C.muted);
        g.beginPath();
        let valid = false;
        for (const q of m.states) {
          if (q.minute > T) break;
          const value = q.values[b];
          if (value === null || value === undefined) { valid = false; continue; }
          const pp = P(q.minute, value, b);
          valid ? g.lineTo(...pp) : g.moveTo(...pp);
          valid = true;
        }
        g.strokeStyle = b === best ? C.gold : C.blue;
        g.lineWidth = b === best ? 3.4 : 2.2;
        g.stroke();
        const value = cur && cur.values[b];
        if (value !== null && value !== undefined) { h.ln(P(T, 0, b), P(T, value, b), '#879aaf', 1); h.dot(P(T, value, b), b === best ? 6 : 4, b === best ? C.gold : C.blue); }
      }
      for (let q = 0; q <= 4; q++) { const p = P(xMax * q / 4, 0, 0); h.txt(p[0], p[1] + 30, hhmm(xMax * q / 4), 15, C.muted, C.fontMono, 400, 'center'); }
      h.txt(90, 535, val(1), 13, C.muted, C.fontMono, 400, 'right');
      h.txt(90, 655, val(.5), 13, C.muted, C.fontMono, 400, 'right');
      h.txt(90, 775, val(0), 13, C.muted, C.fontMono, 400, 'right');
      h.txt(535, 828, m.caption || 'Time along each lane / height is value / lanes are discrete series', 15, C.muted, C.fontBody, 400, 'center');
    }
    h.txt(1360, 283, m.highlightTitle || 'HIGHEST VALUE', 12, C.gold, C.fontBody, 500);
    h.txt(1360, 325, best < 0 ? 'No value' : m.labels[best], 25);
    h.txt(1360, 385, best < 0 ? '—' : val(cur.values[best]), 41, C.gold, C.fontMono);
    (m.notes || []).slice(0, 2).forEach((note, i) => h.wrapped(1360, 451 + i * 119, note, 173, 20, C.muted, 1.35));
  });
}

/* ---------- trajectory: x × y × time state path (the phase-space scene) ---------- */
function trajectoryScene(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    const m = sceneData(s, deck, 'trajectory');
    const tMax = m.tMax || 1440;
    const T = clamp(t / Math.max(1, s.duration - 4)) * tMax;
    canvasChrome(g, C, h, s, deck, hhmm(T), m.clockUnit || 'LOCAL STANDARD TIME');
    const xs = m.points.map(q => q.x);
    const lo = m.x && m.x.min !== undefined ? m.x.min : Math.min(...xs) - (Math.max(...xs) - Math.min(...xs)) * .08 - .5;
    const hi = m.x && m.x.max !== undefined ? m.x.max : Math.max(...xs) + (Math.max(...xs) - Math.min(...xs)) * .08 + .5;
    const Y = Object.assign({ min: 0, max: 100, step: 20, format: '{v}' }, m.y);
    const fx = v => (m.x && m.x.format || '{v}').replace('{v}', fmt(v));
    const fy = v => Y.format.replace('{v}', fmt(v, 0));
    const P = (x, y, tt) => [145 + (x - lo) / (hi - lo) * 850 + tt / tMax * 190, 758 - (y - Y.min) / (Y.max - Y.min) * 390 - tt / tMax * 95];
    for (let v = Y.min; v <= Y.max; v += Y.step) { h.ln(P(lo, v, 0), P(hi, v, 0)); h.txt(120, P(lo, v, 0)[1] + 5, fy(v), 15, C.muted, C.fontMono, 400, 'right'); h.ln(P(lo, v, tMax), P(hi, v, tMax), '#1d3042'); }
    for (let j = 0; j <= 5; j++) { const v = lo + (hi - lo) * j / 5; h.ln(P(v, Y.min, 0), P(v, Y.max, 0)); h.txt(P(v, Y.min, 0)[0], 790, fx(v), 15, C.muted, C.fontMono, 400, 'center'); h.ln(P(v, Y.min, 0), P(v, Y.min, tMax), '#46607b'); }
    h.txt(1130, 659, hhmm(tMax), 14, C.muted, C.fontMono); h.txt(1010, 771, hhmm(0), 14, C.muted, C.fontMono); h.txt(1170, 710, 'TIME', 11, C.gold);
    const pts = m.points.filter(q => q.minute <= T), last = pts.at(-1);
    const gapT = m.gap || 10, window = m.trailWindow || 90;
    let prev = null;
    for (const q of pts) {
      if (prev && q.minute - prev.minute <= gapT) h.ln(P(prev.x, prev.y, prev.minute), P(q.x, q.y, q.minute), q.minute > T - window ? C.gold : '#385b83', q.minute > T - window ? 3 : 1.6);
      prev = q;
    }
    if (last) h.dot(P(last.x, last.y, last.minute), 7, C.gold);
    h.txt(1310, 294, m.panelTitle || 'LATEST MATCHED POINT', 12, C.gold);
    h.txt(1310, 346, last ? fx(last.x) : '—', 42, C.fg, C.fontMono);
    h.txt(1310, 405, last ? fy(last.y) : '—', 42, C.gold, C.fontMono);
    (m.notes || []).slice(0, 2).forEach((note, i) => h.wrapped(1310, 472 + i * 150, note, 220, 22, C.muted, 1.35));
    h.txt(530, 826, m.caption || 'Recorded pairs / gaps remain gaps', 16, C.muted, C.fontBody, 400, 'center');
  });
}

/* ---------- matrix: small multiples with independent clocks (the city matrix) ---------- */
function matrixScene(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    const m = sceneData(s, deck, 'matrix');
    const panels = m.panels;
    const start = (m.clock && m.clock.start) || 0, span = (m.clock && m.clock.span) || 959;
    const T = start + clamp(t / Math.max(1, s.duration - 3)) * span;
    canvasChrome(g, C, h, s, deck, hhmm(T), (m.clock && m.clock.unit) || 'SHARED CLOCK');
    const cols = Math.min(5, panels.length), w = 1470 / cols - 6, rowH = 135;
    const selected = s.selectRotate ? Math.floor(clamp(t / s.duration) * panels.length * 1.999) % panels.length : (s.selected || 0);
    panels.forEach((p, i) => {
      const x = 65 + (i % cols) * (w + 8), y = 278 + Math.floor(i / cols) * rowH;
      const local = T - (p.offset || 0) * 60;
      const state = asof(p.states, local), values = (state && state.values) || [];
      const highest = Math.max(...values.filter(v => v !== null && v !== undefined));
      if (i === selected) { g.strokeStyle = C.gold; g.lineWidth = 1; g.strokeRect(x - 9, y - 20, w + 17, 130); }
      h.txt(x, y, p.label, 19, C.fg, C.fontBody, 500);
      h.txt(x + w - 2, y, hhmm(Math.max(0, local)), 12, C.muted, C.fontMono, 400, 'right');
      const barW = Math.min(29, (w - 14) / p.barLabels.length - 15);
      p.barLabels.forEach((lab, b) => {
        const value = values[b];
        g.fillStyle = value === highest ? C.gold : C.blue;
        if (value !== null && value !== undefined) g.fillRect(x + 7 + b * (barW + 15), y + 72 - value * 60, barW, value * 60);
        h.txt(x + 7 + b * (barW + 15) + barW / 2, y + 90, lab, 10, C.muted, C.fontBody, 400, 'center');
      });
      h.ln([x, y + 72], [x + w - 2, y + 72]);
      const lead = values.indexOf(highest);
      h.txt(x, y + 115, lead < 0 ? (m.emptyLabel || 'No fresh value') : `${p.barLabels[lead]} / ${(m.format || '{v}').replace('{v}', fmt(highest * (m.scale ?? 100)))}`, 13, C.muted);
    });
    const sp = panels[selected], cur = asof(sp.states, T - (sp.offset || 0) * 60);
    h.txt(65, 826, `${sp.label}  ${hhmm(Math.max(0, T - (sp.offset || 0) * 60))}`, 16, C.gold);
    h.txt(450, 826, cur ? cur.values.map((q, b) => `${sp.barLabels[b]}: ${q === null || q === undefined ? '—' : (m.format || '{v}').replace('{v}', fmt(q * (m.scale ?? 100)))}`).join('     ') : (m.emptyLabel || 'No fresh value'), 13, C.muted);
  });
}

/* ---------- cycle: staged loop diagram with a retained-artifact panel (the learning loop) ---------- */
function cycleScene(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    const steps = s.steps, n = steps.length;
    const active = Math.min(n - 1, Math.floor(clamp(t / Math.max(1, s.duration - 3)) * n));
    canvasChrome(g, C, h, s, deck, '', '');
    if (s.clockUnit) h.txt(1534, 166, s.clockUnit, 12, C.muted, C.fontBody, 400, 'right');
    const topCount = Math.ceil(n / 2);
    const sp = Math.min(270, 1010 / Math.max(1, topCount - 1));
    const xy = i => i < topCount ? [170 + i * sp, 365] : [170 + (n - 1 - i) * sp, 670];
    for (let i = 0; i < n; i++) {
      const a = xy(i), b = xy((i + 1) % n);
      const ox = Math.sign(b[0] - a[0]) * 48, oy = Math.sign(b[1] - a[1]) * 48;
      h.ln([a[0] + ox, a[1] + oy], [b[0] - ox, b[1] - oy], i === active ? C.gold : C.line, i === active ? 3 : 1.5);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      g.save(); g.translate(mx, my); g.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]));
      h.ln([-8, -6], [0, 0], C.muted, 1.5); h.ln([-8, 6], [0, 0], C.muted, 1.5);
      g.restore();
    }
    steps.forEach((step, i) => {
      const [x, y] = xy(i);
      g.strokeStyle = i === active ? C.gold : '#385b83';
      g.lineWidth = i === active ? 3 : 1;
      g.beginPath(); g.arc(x, y, 38, 0, Math.PI * 2); g.stroke();
      h.txt(x, y + 10, String(i + 1).padStart(2, '0'), 25, i === active ? C.gold : C.muted, C.fontMono, 400, 'center');
      h.txt(x, y + 78, step.title, 23, C.fg, C.fontBody, 500, 'center');
      if (step.artifact) h.txt(x, y + 108, step.artifact, 14, C.muted, C.fontBody, 400, 'center');
    });
    if (s.centerLabel) h.txt(575, 520, s.centerLabel.toUpperCase(), 15, C.gold, C.fontBody, 500, 'center');
    h.ln([1240, 280], [1240, 799]);
    h.txt(1290, 327, s.panelHeading || 'RETAINED ARTIFACT', 12, C.gold);
    h.wrapped(1290, 379, steps[active].artifact || steps[active].title, 243, 31, C.fg);
    if (steps[active].detail) h.wrapped(1290, 515, steps[active].detail, 242, 23, C.muted, 1.4);
    if (s.panelFooter) h.wrapped(1290, 723, s.panelFooter, 242, 19, C.gold, 1.4);
  });
}

/* ---------- shared record animator (hero/statement/image + elements) ---------- */
function animateRecords(records, s) {
  let last = -1, prevEnabled;
  return {
    count: records.length,
    update(t, enabled = true) {
      if (t === last && enabled === prevEnabled) return;
      last = t; prevEnabled = enabled;
      for (const r of records) {
        const p = enabled ? ease((t - r.delay) / r.duration) : 1;
        r.el.style.opacity = String(r.mode === 'art' ? Math.min(1, .15 + p) : p);
        if (r.mode === 'art') { r.el.style.transform = enabled ? `scale(${1.035 - Math.min(t / 30, 1) * .035})` : 'none'; continue; }
        if (r.el._path) { r.el._path.style.strokeDashoffset = String(1 - p); r.el.style.transform = 'none'; continue; }
        r.el.style.transform = r.mode === 'rise' ? `translateY(${(1 - p) * 16}px)` : r.mode === 'bar' ? `scaleY(${Math.max(.001, p)})` : 'none';
        r.el.style.transformOrigin = r.mode === 'bar' ? 'center bottom' : 'center';
        r.el.style.clipPath = (r.mode === 'reveal' || r.mode === 'line') ? `inset(0 ${(1 - p) * 100}% 0 0)` : 'none';
      }
    },
  };
}

/* ---------- quote ---------- */
function quote(stage, s, deck) {
  const C = palette(s, deck);
  const fig = node('figure', 'ds-quote');
  fig.style.background = C.bg; fig.style.color = C.fg;
  const block = node('blockquote', '', s.title || s.text);
  const cap = node('figcaption');
  const who = node('strong', '', s.attribution || '');
  who.style.color = C.gold;
  cap.append(who);
  if (s.role) cap.append(node('small', '', s.role));
  fig.append(block, cap);
  stage.append(fig);
  return animateRecords([
    { el: block, delay: .15, duration: 1.2, mode: 'rise' },
    { el: cap, delay: 1.3, duration: .9, mode: 'rise' },
  ], s);
}

/* ---------- bullets: the classic list, choreographed ---------- */
function bullets(stage, s, deck) {
  const C = palette(s, deck);
  const wrap = node('div', 'ds-bullets' + (s.side ? ' has-side' : ''));
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  wrap.style.setProperty('--ds-line', C.line);
  const main = node('div');
  if (s.kicker) { const k = node('p', 'kicker-line', s.kicker.toUpperCase()); k.style.color = C.gold; main.append(k); }
  const h1 = node('h1', '', s.title);
  const ul = node('ul');
  const lis = (s.items || []).map(item => {
    const li = node('li', '', typeof item === 'string' ? item : item.text);
    if (item.detail) { const d = node('small', '', item.detail); d.style.color = C.muted; li.append(d); }
    ul.append(li);
    return li;
  });
  main.append(h1, ul);
  wrap.append(main);
  if (s.side) { const side = node('div', 'bullet-side'); const img = node('img'); img.src = s.side.src || s.side; side.append(img); wrap.append(side); }
  stage.append(wrap);
  const step = Math.max(.8, (s.duration - 3) / Math.max(1, lis.length));
  const records = [{ el: h1, delay: .1, duration: .9, mode: 'rise' }];
  lis.forEach((li, i) => records.push({ el: li, delay: 1 + i * step, duration: .8, mode: 'rise' }));
  if (s.side) records.push({ el: wrap.querySelector('.bullet-side'), delay: .5, duration: 1.4, mode: 'reveal' });
  const base = animateRecords(records, s);
  return { count: base.count, update(t, enabled) { base.update(t, enabled); const active = enabled ? Math.floor((t - 1) / step) : lis.length; lis.forEach((li, i) => li.style.color = i <= active ? '' : ''); } };
}

/* ---------- stats: KPI tiles counting up ---------- */
function stats(stage, s, deck) {
  const C = palette(s, deck);
  const tones = ['gold', 'blue', 'green', 'red', 'amber'];
  const wrap = node('div', 'ds-stats');
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  if (s.title) wrap.append(node('h1', '', s.title));
  const row = node('div', 'ds-stat-row');
  const tiles = (s.tiles || []).map((tile, i) => {
    const el = node('div', 'ds-stat');
    el.style.borderTopColor = C[tile.tone || tones[i % tones.length]];
    const label = node('div', 'stat-label', tile.label);
    const valueEl = node('div', 'stat-value', '');
    valueEl.style.color = C[tile.tone || tones[i % tones.length]];
    const note = node('div', 'stat-note', tile.note || '');
    note.style.color = C.muted;
    el.append(label, valueEl, note);
    row.append(el);
    return { tile, valueEl, el };
  });
  wrap.append(row);
  stage.append(wrap);
  const fmtTile = (tile, v) => (tile.prefix || '') + (tile.decimals ? v.toFixed(tile.decimals) : Math.round(v).toLocaleString()) + (tile.suffix || '');
  return {
    count: tiles.length,
    update(t, enabled = true) {
      tiles.forEach(({ tile, valueEl, el }, i) => {
        const p = enabled ? ease((t - .4 - i * .35) / 1.8) : 1;
        el.style.opacity = String(Math.min(1, .1 + p));
        el.style.transform = `translateY(${(1 - p) * 14}px)`;
        valueEl.textContent = fmtTile(tile, (tile.value || 0) * p);
      });
    },
  };
}

/* ---------- gallery / wall / people ---------- */
function gallery(stage, s, deck) {
  const C = palette(s, deck);
  const wrap = node('div', 'ds-gallery');
  wrap.style.background = C.bg;
  const n = (s.images || []).length;
  const cols = s.columns || (n <= 2 ? n : n <= 6 ? 3 : 4);
  wrap.style.gridTemplateColumns = `repeat(${cols},1fr)`;
  wrap.style.gridAutoRows = `${Math.floor((900 - 140 - 14 * Math.ceil(n / cols)) / Math.ceil(n / cols))}px`;
  const records = [];
  (s.images || []).forEach((im, i) => {
    const fig = node('figure');
    const img = node('img'); img.src = im.src || im; img.alt = im.caption || '';
    fig.append(img);
    if (im.caption) fig.append(node('figcaption', '', im.caption));
    wrap.append(fig);
    records.push({ el: fig, delay: .15 + i * .18, duration: 1, mode: 'reveal' });
  });
  stage.append(wrap);
  return animateRecords(records, s);
}
function wall(stage, s, deck) {
  const C = palette(s, deck);
  const wrap = node('div', 'ds-wall');
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  if (s.title) wrap.append(node('h1', '', s.title));
  const grid = node('div', 'wall-grid');
  const n = (s.items || []).length;
  grid.style.gridTemplateColumns = `repeat(${s.columns || Math.min(5, Math.max(3, Math.ceil(Math.sqrt(n))))},1fr)`;
  const records = [];
  (s.items || []).forEach((item, i) => {
    const cell = node('div', 'wall-item');
    cell.style.borderColor = C.line;
    if (item && item.src) { const img = node('img'); img.src = item.src; img.alt = item.alt || ''; cell.append(img); }
    else cell.textContent = typeof item === 'string' ? item : item.text;
    grid.append(cell);
    records.push({ el: cell, delay: .2 + (i % 7) * .14 + Math.floor(i / 7) * .3, duration: .8, mode: 'fade' });
  });
  wrap.append(grid);
  stage.append(wrap);
  return animateRecords(records, s);
}
function people(stage, s, deck) {
  const C = palette(s, deck);
  const tones = [C.blue, C.gold, C.green, C.amber, C.red];
  const wrap = node('div', 'ds-people');
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  if (s.title) wrap.append(node('h1', '', s.title));
  const grid = node('div', 'people-grid');
  grid.style.gridTemplateColumns = `repeat(${s.columns || Math.min(5, (s.people || []).length)},1fr)`;
  const records = [];
  (s.people || []).forEach((person, i) => {
    const card = node('div', 'ds-person');
    const avatar = node('div', 'avatar');
    avatar.style.borderColor = tones[i % tones.length];
    avatar.style.color = tones[i % tones.length];
    if (person.src) { const img = node('img'); img.src = person.src; img.alt = person.name; avatar.append(img); }
    else avatar.textContent = person.initials || person.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('');
    const nameEl = node('strong', '', person.name);
    const role = node('span', '', person.role || '');
    role.style.color = C.muted;
    card.append(avatar, nameEl, role);
    grid.append(card);
    records.push({ el: card, delay: .2 + i * .22, duration: .9, mode: 'rise' });
  });
  wrap.append(grid);
  stage.append(wrap);
  return animateRecords(records, s);
}

/* ---------- countdown: a break slide that counts the scene clock down ---------- */
function countdown(stage, s, deck) {
  const C = palette(s, deck);
  const total = s.seconds || s.duration;
  const wrap = node('div', 'ds-countdown');
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1600 900');
  const ring = document.createElementNS(NS, 'circle');
  for (const [el2, attrs] of [[document.createElementNS(NS, 'circle'), { cx: 800, cy: 450, r: 330, fill: 'none', stroke: C.line, 'stroke-width': 2 }], [ring, { cx: 800, cy: 450, r: 330, fill: 'none', stroke: C.gold, 'stroke-width': 5, 'stroke-linecap': 'round', transform: 'rotate(-90 800 450)', pathLength: 1 }]]) {
    for (const [k, v] of Object.entries(attrs)) el2.setAttribute(k, String(v));
    svg.append(el2);
  }
  ring.style.strokeDasharray = '1';
  const label = node('div', 'cd-label', s.label || 'BACK IN');
  label.style.color = C.gold;
  const time = node('div', 'cd-time', '');
  wrap.append(svg, label, time);
  stage.append(wrap);
  return {
    count: 1,
    update(t, enabled = true) {
      const left = Math.max(0, total - (enabled ? t : total));
      time.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.ceil(left % 60) % 60).padStart(2, '0')}`;
      ring.style.strokeDashoffset = String(1 - left / total);
      time.style.color = left < 10 ? C.gold : C.fg;
    },
  };
}

/* ---------- terminal: a typed session driven by the clock ---------- */
function terminal(stage, s, deck) {
  const C = palette(s, deck);
  const wrap = node('div', 'ds-terminal');
  wrap.style.background = C.bg;
  const win = node('div', 'term-window');
  const bar = node('div', 'term-bar');
  bar.append(node('i'), node('i'), node('i'), node('span', '', s.host || 'distributed.systems'));
  const pre = node('pre');
  win.append(bar, pre);
  wrap.append(win);
  stage.append(wrap);
  const promptStr = s.prompt || '$ ';
  // Build the full script as [class, text] segments; typing budget derives from t.
  const segments = [];
  for (const lineSpec of s.lines || []) {
    if (lineSpec.cmd !== undefined) { segments.push(['t-prompt', promptStr, false], ['t-cmd', lineSpec.cmd + '\n', true]); }
    if (lineSpec.out !== undefined) segments.push(['t-out', lineSpec.out + '\n', false]);
  }
  const typedTotal = segments.filter(seg => seg[2]).reduce((total, seg) => total + seg[1].length, 0);
  const outCount = segments.filter(seg => !seg[2]).length;
  const budgetFor = t => {
    const usable = Math.max(1, s.duration - 2);
    return clamp((t - .4) / usable) * (typedTotal + outCount);
  };
  return {
    count: segments.length,
    update(t, enabled = true) {
      let budget = enabled ? budgetFor(t) : typedTotal + outCount;
      pre.replaceChildren();
      let done = true;
      for (const [cls, text, typed] of segments) {
        const cost = typed ? text.length : 1;
        if (budget <= 0) { done = false; break; }
        const el = node('span', cls);
        if (typed && budget < cost) { el.textContent = text.slice(0, Math.floor(budget)); pre.append(el); done = false; break; }
        el.textContent = text;
        pre.append(el);
        budget -= cost;
      }
      if (!done && enabled) pre.append(node('span', 't-caret'));
    },
  };
}

/* ---------- code: line-by-line reveal with a tiny zero-dep tokenizer ---------- */
const CODE_KEYWORDS = /\b(function|const|let|var|return|if|else|for|while|import|export|from|await|async|class|new|def|async|await|self|None|True|False|null|true|false|struct|fn|pub|impl|match|type|interface)\b/g;
function tokenizeLine(lineText) {
  const out = [];
  let rest = lineText;
  const commentIdx = Math.min(...['//', '#', '--'].map(mark => { const i = rest.indexOf(mark); return i < 0 ? Infinity : i; }));
  let comment = '';
  if (commentIdx !== Infinity) { comment = rest.slice(commentIdx); rest = rest.slice(0, commentIdx); }
  const parts = rest.split(/("[^"]*"|'[^']*'|`[^`]*`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (/^["'`]/.test(part)) { out.push(['tok-s', part]); continue; }
    let last = 0;
    for (const match of part.matchAll(new RegExp(CODE_KEYWORDS.source + '|\\b\\d[\\d_.]*\\b', 'g'))) {
      if (match.index > last) out.push(['', part.slice(last, match.index)]);
      out.push([/^\d/.test(match[0]) ? 'tok-n' : 'tok-k', match[0]]);
      last = match.index + match[0].length;
    }
    if (last < part.length) out.push(['', part.slice(last)]);
  }
  if (comment) out.push(['tok-c', comment]);
  return out;
}
function code(stage, s, deck) {
  const C = palette(s, deck);
  const wrap = node('div', 'ds-code');
  wrap.style.background = C.bg; wrap.style.color = C.fg;
  if (s.title) wrap.append(node('h1', '', s.title));
  const pre = node('pre');
  const highlights = new Set(s.highlights || []);
  const lines = String(s.code || '').replace(/\n$/, '').split('\n').map((lineText, i) => {
    const row = node('div', 'code-line' + (highlights.has(i + 1) ? ' hl' : ''));
    row.append(node('span', 'code-gutter', String(i + 1)));
    const body = node('span');
    for (const [cls, text] of tokenizeLine(lineText)) body.append(cls ? node('span', cls, text) : document.createTextNode(text));
    row.append(body);
    pre.append(row);
    return row;
  });
  wrap.append(pre);
  stage.append(wrap);
  const step = Math.max(.12, (s.duration - 3) / Math.max(1, lines.length));
  const records = lines.map((row, i) => ({ el: row, delay: .5 + i * step, duration: .5, mode: 'fade' }));
  if (s.title) records.unshift({ el: wrap.querySelector('h1'), delay: .1, duration: .8, mode: 'rise' });
  return animateRecords(records, s);
}

/* ---------- elements: choreographed native objects on 1280x720 ---------- */
function autoChoreo(e, s, flowIndex) {
  if (e.enter) return { delay: e.enter.delay || 0, duration: e.enter.duration || .85, mode: e.enter.mode || 'rise' };
  if (e.kind === 'connector' || e.geometry === 'line') return { delay: .7 + Math.max(0, flowIndex) * .23, duration: .8, mode: 'connector' };
  if (e.y >= 665) return { delay: 0, duration: .4, mode: 'fade' };
  if (e.src && e.w > 1250 && e.h > 700) return { delay: 0, duration: 1.4, mode: 'art' };
  if ((e.name || '').startsWith('title')) return { delay: .12, duration: .85, mode: 'rise' };
  if (e.y < 130) return { delay: .05, duration: .6, mode: 'fade' };
  if (e.src) return { delay: .5, duration: 1.5, mode: 'reveal' };
  return { delay: e.y > 510 ? 1.8 : e.x > 900 ? 1.9 : .55 + Math.min(1, e.x / 1800), duration: 1, mode: 'rise' };
}
function elements(stage, s, deck) {
  const C = palette(s, deck);
  const layer = node('div', 'native-slide');
  layer.style.background = s.background || C.bg;
  layer.dataset.slide = s.id;
  stage.append(layer);
  const byId = new Map(s.elements.filter(e => e.id !== undefined).map(e => [String(e.id), e]));
  const nodesInOrder = s.elements.filter(x => x.text && x.fill !== 'transparent');
  const records = [];
  s.elements.forEach((e, index) => {
    const host = node('div', 'native-object');
    host.dataset.object = index;
    if (e.kind === 'connector' || e.geometry === 'line') {
      const svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
      svg.setAttribute('viewBox', '0 0 1280 720');
      Object.assign(host.style, { left: 0, top: 0, width: '1280px', height: '720px', overflow: 'visible' });
      svg.classList.add('native-connector');
      let a = [e.x || 0, e.y || 0], b = [(e.x || 0) + (e.w || 0), (e.y || 0) + (e.h || 0)];
      if (e.flipH) [a[0], b[0]] = [b[0], a[0]];
      if (e.flipV) [a[1], b[1]] = [b[1], a[1]];
      const from = byId.get(String(e.from)), to = byId.get(String(e.to));
      if (from && to) {
        const f = [from.x + from.w / 2, from.y + from.h / 2], t2 = [to.x + to.w / 2, to.y + to.h / 2];
        const dx = t2[0] - f[0], dy = t2[1] - f[1];
        const edge = bx => Math.min(Math.abs(dx) > 0 ? bx.w / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? bx.h / 2 / Math.abs(dy) : Infinity);
        a = [f[0] + dx * edge(from), f[1] + dy * edge(from)];
        b = [t2[0] - dx * edge(to), t2[1] - dy * edge(to)];
      }
      const stroke = !e.stroke || e.stroke === 'transparent' ? C.blue : e.stroke;
      path.setAttribute('d', `M${a.join(',')} L${b.join(',')}`);
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', e.strokeWidth || 2);
      path.setAttribute('fill', 'none');
      path.setAttribute('pathLength', '1');
      path.style.strokeDasharray = '1';
      svg.append(path);
      if (e.head === 'triangle' || e.tail === 'triangle') {
        const id = 'arrow-' + s.id + '-' + index;
        const defs = document.createElementNS(NS, 'defs'), marker = document.createElementNS(NS, 'marker'), head = document.createElementNS(NS, 'path');
        marker.id = id;
        marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5'); marker.setAttribute('orient', 'auto');
        head.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        head.setAttribute('fill', stroke);
        marker.append(head); defs.append(marker); svg.prepend(defs);
        path.setAttribute('marker-end', `url(#${id})`);
      }
      host.append(svg);
      host._path = path;
    } else {
      Object.assign(host.style, { left: e.x + 'px', top: e.y + 'px', width: Math.max(.1, e.w) + 'px', height: Math.max(.1, e.h) + 'px' });
      if (e.src) {
        const img = node('img', 'native-picture');
        img.src = e.src; img.alt = e.alt || '';
        const c = e.crop || [0, 0, 0, 0], w = 1 - c[0] - c[2], h = 1 - c[1] - c[3];
        Object.assign(img.style, { width: 100 / w + '%', height: 100 / h + '%', left: -c[0] / w * 100 + '%', top: -c[1] / h * 100 + '%' });
        host.append(img);
      } else {
        Object.assign(host.style, {
          background: e.fill && e.fill !== 'transparent' ? e.fill : 'transparent',
          border: e.strokeWidth > 0 ? `${e.strokeWidth}px solid ${e.stroke}` : 'none',
          borderRadius: e.geometry === 'ellipse' ? '50%' : e.geometry === 'roundRect' ? '14px' : '0',
        });
        if (e.text) {
          host.classList.add('native-text');
          Object.assign(host.style, {
            padding: (e.insets || [0, 0, 0, 0]).map(x => x + 'px').join(' '),
            justifyContent: e.anchor === 'ctr' ? 'center' : e.anchor === 'b' ? 'flex-end' : 'flex-start',
          });
          for (const p of e.text) {
            const par = node('p', 'native-paragraph');
            par.textContent = p.text;
            Object.assign(par.style, {
              fontSize: p.size * (e.fontScale || 1) + 'px',
              fontWeight: p.bold ? '700' : '400',
              color: !p.color || p.color === 'transparent' ? C.fg : p.color,
              textAlign: { ctr: 'center', r: 'right', l: 'left' }[p.align] || 'left',
              lineHeight: String(Math.max(1, p.lineHeight || 1.2)),
            });
            host.append(par);
          }
        }
      }
    }
    layer.append(host);
    const flowIndex = e.from ? nodesInOrder.findIndex(x => String(x.id) === String(e.from)) : nodesInOrder.findIndex(x => x === e);
    records.push({ el: host, ...autoChoreo(e, s, flowIndex) });
  });
  // Shrink overflowing text blocks so nothing clips on stage.
  requestAnimationFrame(() => {
    for (const el of layer.querySelectorAll('.native-text')) {
      let tries = 0;
      while (el.scrollHeight > el.clientHeight + 2 && tries++ < 12)
        for (const p of el.children) p.style.fontSize = parseFloat(p.style.fontSize) * .97 + 'px';
    }
  });
  return animateRecords(records, s);
}

/* ---------- diagram: staged system graph ---------- */
function diagram(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, rect, line, text } = k;
  const groups = [], paths = [], dots = [];
  const stageOf = v => Math.min(k.phaseCount() - 1, v || 0);
  const map = new Map(s.nodes.map(n => [n.id, n]));
  function autoPoints(a, b) {
    const ac = [a.x + a.w / 2, a.y + a.h / 2], bc = [b.x + b.w / 2, b.y + b.h / 2];
    if (Math.abs(ac[0] - bc[0]) >= Math.abs(ac[1] - bc[1])) {
      const right = bc[0] > ac[0], p = [right ? a.x + a.w : a.x, ac[1]], q = [right ? b.x : b.x + b.w, bc[1]], m = (p[0] + q[0]) / 2;
      return [p, [m, p[1]], [m, q[1]], q];
    }
    const down = bc[1] > ac[1], p = [ac[0], down ? a.y + a.h : a.y], q = [bc[0], down ? b.y : b.y + b.h], m = (p[1] + q[1]) / 2;
    return [p, [p[0], m], [q[0], m], q];
  }
  function edgePath(points, phase, tone) {
    const d = points.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join(' ');
    const base = el('path', { d, fill: 'none', stroke: C.line, 'stroke-width': 2, 'marker-end': `url(#${k.arrowMarker('line')})` });
    const active = el('path', { d, fill: 'none', stroke: C[tone] || C.blue, 'stroke-width': 3, 'marker-end': `url(#${k.arrowMarker(tone)})` });
    const length = active.getTotalLength();
    active.style.strokeDasharray = String(length);
    paths.push({ el: active, length, phase });
    const travel = el('circle', { r: 5, fill: C[tone] || C.blue });
    dots.push({ el: travel, path: base, length, phase });
  }
  for (const e of s.edges || []) {
    const a = map.get(e.from), b = map.get(e.to);
    edgePath(e.points || autoPoints(a, b), stageOf(e.stage), e.tone || (b.tone === 'amber' ? 'amber' : 'blue'));
  }
  for (const n of s.nodes) {
    const g = el('g', { 'data-phase': stageOf(n.stage), 'data-node': n.id });
    groups.push(g);
    rect(n.x, n.y, n.w, n.h, C.panel, C.line, g);
    line(n.x, n.y, n.x, n.y + n.h, C[n.tone] || C.blue, 4, g);
    const titleSize = /[._]/.test(n.title) ? 23 : 27;
    const t = text(n.title, n.x + 21, n.y + 36, n.w - 42, titleSize, C.fg, g, false, 600, 1.16);
    if (n.body) text(n.body, n.x + 21, n.y + 36 + t._height + 7, n.w - 42, n.body.split('\n').length > 2 ? 21 : 23, C.muted, g, false, 400, 1.27);
  }
  for (const l of s.labels || []) text(l.text, l.x, l.y, l.w || 500, l.size || 20, C[l.tone] || C.muted, k.svg, l.mono, l.tone ? 500 : 400);
  k.updates.push((t, enabled, phase) => {
    groups.forEach(g => { const st = +g.dataset.phase; g.style.opacity = enabled ? String(.25 + .75 * clamp((t - st * .35) / .9)) : '1'; });
    paths.forEach(p => { p.el.style.strokeDashoffset = String(p.length * (1 - (enabled ? clamp((t - p.phase * .45) / 1.7) : 1))); p.el.style.opacity = enabled && phase === p.phase ? '.92' : '.24'; });
    dots.forEach(d => {
      const show = enabled && phase === d.phase && t > 1.9 && t < s.duration - 1;
      d.el.style.opacity = show ? '1' : '0';
      if (show) { const q = d.path.getPointAtLength((((t - 1.9) % 4.8) / 4.8) * d.length); d.el.setAttribute('cx', q.x); d.el.setAttribute('cy', q.y); }
    });
  });
  return k.finish();
}

/* ---------- chart layouts ---------- */
function chart(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, rect, line, dot, group, text, small, value, change, box, flow } = k;
  const layouts = {
    bars() {
      const rows = s.bars, max = s.max || Math.max(...rows.map(r => r.value));
      const x0 = 480, w = 940, rowH = Math.min(120, 460 / rows.length * .96), gap = Math.min(150, 490 / rows.length);
      rows.forEach((r, i) => {
        const y = 300 + i * gap, tone = C[r.tone] || C.blue;
        text(r.label, 65, y + rowH * .55, 390, 28, C.fg);
        rect(x0, y, w, rowH, 'transparent', C.line);
        const bar = rect(x0, y, 0, rowH, tone, 'none');
        const num = value('', x0 + 24, y + rowH * .62, 340, C.bg, k.svg, Math.min(34, rowH * .5));
        if (r.note) text(r.note, 65, y + rowH * .55 + 34, 390, 18, C.muted);
        k.updates.push((t, on) => {
          const p = ease(((on ? t : s.duration) - .6 - i * .5) / 1.6);
          bar.setAttribute('width', Math.max(0, w * (r.value / max) * p));
          change(num, p > .05 ? (r.display !== undefined ? r.display : Math.round(r.value * p) + (s.unit || '')) : '');
          num.style.opacity = p > .25 ? '1' : '0';
        });
      });
    },
    series() {
      const sp = s.series, X = { min: sp.x.min, max: sp.x.max }, Y = { min: sp.y.min, max: sp.y.max };
      const x0 = 110, y0 = 700, w = 1050, h = 385;
      const px = v => x0 + (v - X.min) / (X.max - X.min) * w;
      const py = v => y0 - (v - Y.min) / (Y.max - Y.min) * h;
      const yStep = (Y.max - Y.min) / 5, xStep = (X.max - X.min) / (sp.x.ticks || 6);
      for (let i = 0; i <= 5; i++) { const v = Y.min + yStep * i; line(x0, py(v), x0 + w, py(v)); text(sp.y.format ? sp.y.format.replace('{v}', fmt(v, 0)) : fmt(v, 0), 65, py(v) + 6, 65, 18, C.muted); }
      for (let i = 0; i <= (sp.x.ticks || 6); i++) { const v = X.min + xStep * i; text(sp.x.format ? sp.x.format.replace('{v}', fmt(v, 0)) : fmt(v, 0), px(v) - 24, y0 + 39, 95, 18, C.muted, k.svg, true); }
      if (sp.x.label) small(sp.x.label.toUpperCase(), x0, 277, w);
      sp.lines.forEach((ln2, li) => {
        const tone = C[ln2.tone] || [C.blue, C.gold, C.green, C.red][li % 4];
        const path = el('path', { stroke: tone, fill: 'none', 'stroke-width': li === 0 ? 3 : 2.2 });
        const head = dot(px(ln2.points[0][0]), py(ln2.points[0][1]), 6, tone);
        small(ln2.label.toUpperCase(), 1240, 326 + li * 130, 300, tone);
        const readout = value('—', 1240, 391 + li * 130, 300, tone, k.svg, 45);
        k.updates.push((t, on) => {
          const frac = clamp((on ? t : s.duration) / (s.duration - 3));
          const cut = X.min + (X.max - X.min) * frac;
          let d = '', lastPt = null;
          for (const pt of ln2.points) { if (pt[0] > cut) break; d += (d ? 'L' : 'M') + px(pt[0]) + ',' + py(pt[1]); lastPt = pt; }
          path.setAttribute('d', d);
          if (lastPt) { head.setAttribute('cx', px(lastPt[0])); head.setAttribute('cy', py(lastPt[1])); change(readout, sp.y.format ? sp.y.format.replace('{v}', fmt(lastPt[1])) : fmt(lastPt[1])); }
          head.style.opacity = lastPt ? '1' : '0';
        });
      });
    },
    timeline() {
      const items = s.items, x0 = 125, x1 = 1425, yy = 428;
      const xs = items.map((_, i) => mix(x0, x1, items.length === 1 ? 0 : i / (items.length - 1)));
      line(x0, yy, x1, yy, C.line, 3);
      items.forEach((it, i) => {
        const g = group(i * .12), tone = C[it.tone] || C.blue;
        dot(xs[i], yy, 10, tone, g);
        text(it.title, xs[i] - 60, 323, 330, 22, it.tone === 'red' ? C.red : C.fg, g, true);
        if (it.body) text(it.body, xs[i] - 60, 489, 320, 25, C.muted, g);
      });
      if (s.band) {
        const bx0 = xs[s.band.from], bx1 = xs[s.band.to];
        rect(bx0, 573, bx1 - bx0, 96, C.panel, C.line);
        line(bx0, 573, bx1, 573, C[s.band.tone] || C.red, 4);
        text(s.band.text, bx0 + 23, 629, bx1 - bx0 - 46, 30, C[s.band.tone] || C.red);
      }
      const cursor = dot(x0, yy, 8, C.gold);
      k.updates.push((t, on) => cursor.setAttribute('cx', mix(x0, x1, clamp((on ? t : s.duration) / (s.duration - 3)))));
    },
    columns() {
      const cols = s.columns, colW = Math.min(450, (1470 - (cols.length - 1) * 60) / cols.length);
      cols.forEach((c, i) => {
        const x = 65 + i * (colW + 60);
        small(c.title.toUpperCase(), x, 282, colW, C[c.tone] || C.blue);
        c.boxes.forEach((b, j) => box(x, 319 + j * 203, colW, 168, b.title, b.body, c.tone || 'blue', i * .2 + j * .15));
        const l = line(x, 713, x, 713, C[c.tone] || C.blue, 4);
        k.updates.push((t, on) => l.setAttribute('x2', x + colW * clamp(((on ? t : s.duration) - i * (s.duration / 5)) / (s.duration / 4))));
      });
    },
    cadence() {
      // Schedule tick rows with a sweeping cursor (the worker-cadence scene).
      const rows = s.rows, windowSec = s.windowSec || 3600;
      const x0 = 535, w = 970, y0 = 329, rowH = Math.min(55, 420 / rows.length);
      if (s.headline) { text(s.headline, 65, 291, 350, 32, C.gold, k.svg, false, 500); if (s.headlineSub) text(s.headlineSub, 405, 288, 1100, 23, C.muted); }
      for (let sec = 0; sec <= windowSec; sec += windowSec / 4) {
        const x = x0 + sec / windowSec * w;
        line(x, 315, x, y0 + rows.length * rowH + 24, C.line, 1);
        text(Math.round(sec / 60) + ' min', x, 304, 100, 15, C.muted, k.svg, true);
      }
      rows.forEach((r, i) => {
        const y = y0 + i * rowH, g2 = group(i * .12);
        text(r.label, 65, y + 2, 335, 22, C.fg, g2);
        text(r.intervalSec < 60 ? r.intervalSec + 's' : r.intervalSec / 60 + 'm', 405, y + 2, 90, 23, C.gold, g2, true);
        line(x0, y + 10, x0 + w, y + 10, C.line, 1, g2);
        for (let tick = r.offsetSec || 0; tick <= windowSec; tick += r.intervalSec)
          line(x0 + tick / windowSec * w, y, x0 + tick / windowSec * w, y + 20, C.blue, r.intervalSec <= 30 ? 1.1 : 3, g2);
      });
      const sweep = line(x0, 314, x0, y0 + rows.length * rowH + 22, C.gold, 2.5);
      k.updates.push((t, on) => {
        const x = x0 + clamp((on ? t : s.duration) / (s.duration - 3)) * w;
        sweep.setAttribute('x1', x); sweep.setAttribute('x2', x);
        sweep.style.opacity = on && t < s.duration ? '.85' : '0';
      });
      if (s.caption) text(s.caption, x0, y0 + rows.length * rowH + 60, w, 20, C.muted);
    },
    donut() {
      const segs = s.segments, total = segs.reduce((a, b) => a + b.value, 0);
      const cx = 450, cy = 515, r = 200, tones = ['blue', 'gold', 'green', 'amber', 'red'];
      let acc = 0;
      const arcs = segs.map((seg, i) => {
        const a0 = acc / total * Math.PI * 2 - Math.PI / 2;
        acc += seg.value;
        const a1 = acc / total * Math.PI * 2 - Math.PI / 2 - .012;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = el('path', { d: `M${cx + Math.cos(a0) * r},${cy + Math.sin(a0) * r} A${r},${r} 0 ${large} 1 ${cx + Math.cos(a1) * r},${cy + Math.sin(a1) * r}`, fill: 'none', stroke: C[seg.tone || tones[i % 5]], 'stroke-width': 62 });
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        return { p, len, f0: (acc - seg.value) / total, f1: acc / total, seg, tone: seg.tone || tones[i % 5] };
      });
      if (s.centerLabel) { text(s.centerLabel, cx, cy - 6, 240, 24, C.muted, k.svg, false, 500, 1.15, 'middle'); }
      const centerValue = value('', cx - 90, cy + 52, 190, C.fg, k.svg, 44);
      centerValue.setAttribute('text-anchor', 'middle');
      centerValue.setAttribute('x', cx);
      arcs.forEach((a, i) => {
        const y = 330 + i * 78, g2 = group(.2 + i * .12);
        rect(880, y - 24, 30, 30, C[a.tone], 'none', g2);
        text(a.seg.label, 936, y, 420, 26, C.fg, g2, false, 500);
        a.pct = text('', 1420, y, 110, 26, C.muted, g2, true, 400, 1.2, 'end');
      });
      k.updates.push((t, on) => {
        const f = clamp(((on ? t : s.duration) - .4) / (s.duration * .55));
        let shown = 0;
        arcs.forEach(a => {
          const local = clamp((f - a.f0) / (a.f1 - a.f0));
          a.p.style.strokeDashoffset = String(a.len * (1 - local));
          change(a.pct, Math.round(a.seg.value / total * 100 * local) + '%');
          shown += a.seg.value * local;
        });
        change(centerValue, (s.format || '{v}').replace('{v}', Math.round(shown).toLocaleString()));
      });
    },
    gauge() {
      const max = s.max || 100, cx = 800, cy = 700, R = 330;
      const arc = (r2, a0, a1, tone, width) => {
        const p = el('path', { d: `M${cx + Math.cos(a0) * r2},${cy + Math.sin(a0) * r2} A${r2},${r2} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + Math.cos(a1) * r2},${cy + Math.sin(a1) * r2}`, fill: 'none', stroke: tone, 'stroke-width': width });
        return p;
      };
      let from = 0;
      for (const band of s.bands || [{ to: max, tone: 'blue' }]) {
        arc(R, Math.PI + from / max * Math.PI, Math.PI + band.to / max * Math.PI, C[band.tone] || C.blue, 30).style.opacity = '.35';
        from = band.to;
      }
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + i / 10 * Math.PI;
        line(cx + Math.cos(a) * (R - 34), cy + Math.sin(a) * (R - 34), cx + Math.cos(a) * (R - 52), cy + Math.sin(a) * (R - 52), C.line, 2);
        text((s.format || '{v}').replace('{v}', String(Math.round(max * i / 10))), cx + Math.cos(a) * (R - 88), cy + Math.sin(a) * (R - 88) + 7, 90, 17, C.muted, k.svg, true, 400, 1.1, 'middle');
      }
      const needle = line(cx, cy, cx - R + 70, cy, C.gold, 4);
      dot(cx, cy, 14, C.gold);
      const readout = value('', cx, cy - 120, 400, C.fg, k.svg, 76);
      readout.setAttribute('text-anchor', 'middle');
      if (s.label) text(s.label.toUpperCase(), cx, cy - 190, 500, 17, C.muted, k.svg, false, 600, 1.1, 'middle');
      k.updates.push((t, on) => {
        const p = ease(((on ? t : s.duration) - .4) / (s.duration * .5));
        const a = Math.PI + (s.value / max) * Math.PI * p;
        needle.setAttribute('x2', cx + Math.cos(a) * (R - 62));
        needle.setAttribute('y2', cy + Math.sin(a) * (R - 62));
        change(readout, (s.format || '{v}').replace('{v}', fmt(s.value * p, s.decimals ?? 0)));
      });
    },
    scatter() {
      const pts = s.points;
      const X = Object.assign({ min: Math.min(...pts.map(p => p.x)), max: Math.max(...pts.map(p => p.x)) }, s.x);
      const Y = Object.assign({ min: Math.min(...pts.map(p => p.y)), max: Math.max(...pts.map(p => p.y)) }, s.y);
      const x0 = 170, y0 = 720, w = 1240, h = 420;
      const px = v => x0 + (v - X.min) / (X.max - X.min || 1) * w;
      const py = v => y0 - (v - Y.min) / (Y.max - Y.min || 1) * h;
      for (let i = 0; i <= 5; i++) {
        const yv = Y.min + (Y.max - Y.min) * i / 5, xv = X.min + (X.max - X.min) * i / 5;
        line(x0, py(yv), x0 + w, py(yv));
        text((Y.format || '{v}').replace('{v}', fmt(yv, 0)), 100, py(yv) + 6, 60, 17, C.muted, k.svg, true, 400, 1.1, 'end');
        text((X.format || '{v}').replace('{v}', fmt(xv, 0)), px(xv) - 30, y0 + 38, 110, 17, C.muted, k.svg, true);
      }
      if (s.quadrants) {
        line(x0 + w / 2, y0 - h, x0 + w / 2, y0, C.gold, 1.4);
        line(x0, y0 - h / 2, x0 + w, y0 - h / 2, C.gold, 1.4);
        (s.quadrants.labels || []).forEach((label, i) => text(label.toUpperCase(), i % 2 ? x0 + w - 24 : x0 + 24, i < 2 ? y0 - h + 40 : y0 - 26, 420, 16, C.gold, k.svg, false, 600, 1.1, i % 2 ? 'end' : 'start'));
      }
      const step = Math.max(.08, (s.duration - 4) / pts.length);
      pts.forEach((p, i) => {
        const c = dot(px(p.x), py(p.y), 0, C[p.tone] || C.blue);
        const label = p.label ? text(p.label, px(p.x) + 16, py(p.y) + 6, 250, 17, C.fg, k.svg, false, 500) : null;
        k.updates.push((t, on) => {
          const pr = ease(((on ? t : s.duration) - .5 - i * step) / .5);
          c.setAttribute('r', String((p.r || 8) * pr));
          if (label) label.style.opacity = String(pr);
        });
      });
    },
    heatmap() {
      const rows = s.rows, cols = s.cols, V = s.values;
      const maxV = s.max || Math.max(...V.flat());
      const x0 = 340, y0 = 300, cw = Math.min(120, 1170 / cols.length), ch = Math.min(66, 450 / rows.length);
      cols.forEach((c, j) => text(String(c), x0 + j * cw + cw / 2, y0 - 18, cw - 6, 15, C.muted, k.svg, true, 400, 1.1, 'middle'));
      rows.forEach((r, i) => text(String(r), x0 - 20, y0 + i * ch + ch / 2 + 6, 260, 19, C.fg, k.svg, false, 500, 1.1, 'end'));
      const cells = [];
      rows.forEach((r, i) => cols.forEach((c, j) => {
        const v = (V[i] || [])[j] ?? 0;
        const cell = rect(x0 + j * cw + 1.5, y0 + i * ch + 1.5, cw - 3, ch - 3, lerpColor(s.light ? '#e8ebe4' : '#101f2d', s.light ? '#245da3' : '#8eb6fc', v / maxV), 'none');
        const label = s.showValues ? text((s.format || '{v}').replace('{v}', fmt(v, s.decimals ?? 0)), x0 + j * cw + cw / 2, y0 + i * ch + ch / 2 + 6, cw, 15, v / maxV > .55 ? C.bg : C.muted, k.svg, true, 400, 1.1, 'middle') : null;
        cells.push({ cell, label, j });
      }));
      k.updates.push((t, on) => {
        const f = ((on ? t : s.duration) / Math.max(1, s.duration - 3)) * cols.length;
        for (const { cell, label, j } of cells) {
          const pr = ease((f - j) / 1);
          cell.style.opacity = String(pr);
          if (label) label.style.opacity = String(pr);
        }
      });
    },
    histogram() {
      const bins = s.bins, maxV = Math.max(...bins.map(b => b.count));
      const x0 = 150, y0 = 710, w = 1300, h = 400, bw = w / bins.length;
      for (let i = 0; i <= 4; i++) { const v = maxV * i / 4; line(x0, y0 - h * i / 4, x0 + w, y0 - h * i / 4); text(fmt(v, 0), 96, y0 - h * i / 4 + 6, 48, 16, C.muted, k.svg, true, 400, 1.1, 'end'); }
      const bars = bins.map((b, i) => {
        const bar = rect(x0 + i * bw + 3, y0, bw - 6, 0, C.blue, 'none');
        if (i % Math.ceil(bins.length / 12) === 0) text(String(b.label), x0 + i * bw + bw / 2, y0 + 34, bw + 40, 15, C.muted, k.svg, true, 400, 1.1, 'middle');
        return bar;
      });
      const curve = s.overlay ? el('path', { fill: 'none', stroke: C.gold, 'stroke-width': 3 }) : null;
      k.updates.push((t, on) => {
        const tt = on ? t : s.duration;
        bins.forEach((b, i) => {
          const pr = ease((tt - .3 - i * .07) / .9);
          const hh2 = h * b.count / maxV * pr;
          bars[i].setAttribute('y', y0 - hh2);
          bars[i].setAttribute('height', Math.max(0, hh2));
        });
        if (curve) {
          const d = bins.map((b, i) => (i ? 'L' : 'M') + (x0 + i * bw + bw / 2) + ',' + (y0 - h * b.count / maxV)).join(' ');
          curve.setAttribute('d', d);
          const pr = clamp((tt - bins.length * .07 - 1) / 1.2);
          curve.style.opacity = String(pr);
        }
      });
    },
    waterfall() {
      const steps = s.steps;
      const cums = [0];
      for (const st of steps) cums.push(cums[cums.length - 1] + st.delta);
      const lo = Math.min(...cums, 0), hi = Math.max(...cums);
      const n = steps.length + (s.total === false ? 0 : 1);
      const x0 = 170, w = 1290, bw = w / n * .62, gap = w / n;
      const y = v => 700 - (v - lo) / (hi - lo || 1) * 380;
      for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; line(x0 - 20, y(v), x0 + w, y(v)); text((s.format || '{v}').replace('{v}', fmt(v, 0)), 140, y(v) + 6, 90, 16, C.muted, k.svg, true, 400, 1.1, 'end'); }
      const step = Math.max(.4, (s.duration - 4) / n);
      steps.forEach((st, i) => {
        const a = cums[i], b = cums[i + 1], up = st.delta >= 0;
        const g2 = el('g');
        rect(x0 + i * gap, y(Math.max(a, b)), bw, Math.abs(y(a) - y(b)), up ? C.green : C.red, 'none', g2);
        if (i < steps.length - 1 || s.total !== false) el('line', { x1: x0 + i * gap + bw, y1: y(b), x2: x0 + (i + 1) * gap, y2: y(b), stroke: C.line, 'stroke-width': 1.4, 'stroke-dasharray': '5 5' }, g2);
        text(st.label, x0 + i * gap + bw / 2, 745, gap + 30, 17, C.muted, g2, false, 400, 1.1, 'middle');
        text((up ? '+' : '') + fmt(st.delta, 0), x0 + i * gap + bw / 2, y(Math.max(a, b)) - 12, gap, 18, up ? C.green : C.red, g2, true, 500, 1.1, 'middle');
        k.updates.push((t, on) => g2.style.opacity = String(ease(((on ? t : s.duration) - .4 - i * step) / .6)));
      });
      if (s.total !== false) {
        const g2 = el('g');
        const final = cums[cums.length - 1];
        rect(x0 + steps.length * gap, y(Math.max(0, final)), bw, Math.abs(y(0) - y(final)), C.gold, 'none', g2);
        text(s.totalLabel || 'Total', x0 + steps.length * gap + bw / 2, 745, gap, 17, C.fg, g2, false, 600, 1.1, 'middle');
        text(fmt(final, 0), x0 + steps.length * gap + bw / 2, y(Math.max(0, final)) - 12, gap, 19, C.gold, g2, true, 600, 1.1, 'middle');
        k.updates.push((t, on) => g2.style.opacity = String(ease(((on ? t : s.duration) - .4 - steps.length * step) / .6)));
      }
    },
    slope() {
      const xl = 470, xr = 1130, values = s.lines.flatMap(l => [l.a, l.b]);
      const lo = Math.min(...values), hi = Math.max(...values);
      const y = v => 700 - (v - lo) / (hi - lo || 1) * 380;
      line(xl, 290, xl, 720, C.line, 1.6); line(xr, 290, xr, 720, C.line, 1.6);
      text((s.left || 'BEFORE').toUpperCase(), xl, 272, 300, 17, C.muted, k.svg, false, 600, 1.1, 'middle');
      text((s.right || 'AFTER').toUpperCase(), xr, 272, 300, 17, C.muted, k.svg, false, 600, 1.1, 'middle');
      const tones = ['gold', 'blue', 'green', 'amber', 'red'];
      s.lines.forEach((l, i) => {
        const tone = C[l.tone] || C[tones[i % 5]];
        const path = el('line', { x1: xl, y1: y(l.a), x2: xr, y2: y(l.b), stroke: tone, 'stroke-width': 2.6 });
        path.style.strokeDasharray = String(xr - xl);
        dot(xl, y(l.a), 7, tone); dot(xr, y(l.b), 7, tone);
        text(`${l.label}  ${(s.format || '{v}').replace('{v}', fmt(l.a, s.decimals ?? 0))}`, xl - 24, y(l.a) + 6, 380, 20, C.fg, k.svg, false, 500, 1.1, 'end');
        const endLabel = text((s.format || '{v}').replace('{v}', fmt(l.b, s.decimals ?? 0)), xr + 24, y(l.b) + 6, 340, 20, tone, k.svg, false, 600);
        k.updates.push((t, on) => {
          const pr = ease(((on ? t : s.duration) - .5 - i * .3) / 1.1);
          path.style.strokeDashoffset = String((xr - xl) * (1 - pr));
          endLabel.style.opacity = String(pr > .96 ? 1 : 0);
        });
      });
    },
    funnel() {
      const stages = s.stages, maxV = stages[0].value, cx = 620;
      const n = stages.length, hh2 = Math.min(105, 450 / n), gap2 = 10;
      stages.forEach((st, i) => {
        const wTop = 860 * (st.value / maxV), wBot = 860 * ((stages[i + 1] ? stages[i + 1].value : st.value * .85) / maxV);
        const yTop = 295 + i * (hh2 + gap2);
        const g2 = el('g');
        el('path', { d: `M${cx - wTop / 2},${yTop} L${cx + wTop / 2},${yTop} L${cx + wBot / 2},${yTop + hh2} L${cx - wBot / 2},${yTop + hh2} Z`, fill: lerpColor(s.light ? '#245da3' : '#8eb6fc', s.light ? '#edf0eb' : '#101f2d', i / Math.max(1, n - 1) * .75), stroke: 'none' }, g2);
        text(st.label, cx, yTop + hh2 / 2 - 4, wTop, 23, i < 2 && !s.light ? C.bg : C.fg, g2, false, 600, 1.1, 'middle');
        text((s.format || '{v}').replace('{v}', st.value.toLocaleString()), cx, yTop + hh2 / 2 + 24, wTop, 17, i < 2 && !s.light ? C.bg : C.muted, g2, true, 400, 1.1, 'middle');
        if (i > 0) text(Math.round(st.value / stages[i - 1].value * 100) + '%', 1180, yTop + 8, 160, 22, C.gold, g2, true);
        k.updates.push((t, on) => { const pr = ease(((on ? t : s.duration) - .3 - i * .4) / .8); g2.style.opacity = String(pr); g2.style.transform = `translateY(${(1 - pr) * 12}px)`; });
      });
      if (s.note) text(s.note, 1180, 300, 340, 19, C.muted, k.svg);
    },
    radar() {
      const axes = s.axes, n = axes.length, cx = 800, cy = 525, R = 245;
      const angle = i => -Math.PI / 2 + i / n * Math.PI * 2;
      for (const frac of [.25, .5, .75, 1]) {
        el('path', { d: axes.map((_, i) => (i ? 'L' : 'M') + (cx + Math.cos(angle(i)) * R * frac) + ',' + (cy + Math.sin(angle(i)) * R * frac)).join(' ') + ' Z', fill: 'none', stroke: C.line, 'stroke-width': frac === 1 ? 1.6 : .8 });
      }
      axes.forEach((axis, i) => {
        line(cx, cy, cx + Math.cos(angle(i)) * R, cy + Math.sin(angle(i)) * R, C.line, .8);
        const lx = cx + Math.cos(angle(i)) * (R + 44), ly = cy + Math.sin(angle(i)) * (R + 40);
        text(axis, lx, ly + 6, 240, 19, C.muted, k.svg, false, 500, 1.15, Math.abs(Math.cos(angle(i))) < .3 ? 'middle' : Math.cos(angle(i)) > 0 ? 'start' : 'end');
      });
      const tones = ['gold', 'blue', 'green'];
      (s.series || []).forEach((ser, si) => {
        const tone = C[ser.tone] || C[tones[si % 3]];
        const poly = el('path', { fill: tone, 'fill-opacity': 0, stroke: tone, 'stroke-width': 2.6 });
        const pts = ser.values.map((v, i) => [cx + Math.cos(angle(i)) * R * clamp(v), cy + Math.sin(angle(i)) * R * clamp(v)]);
        if (ser.label) text(ser.label.toUpperCase(), 1310, 320 + si * 46, 240, 18, tone, k.svg, false, 600);
        k.updates.push((t, on) => {
          const f = clamp(((on ? t : s.duration) - .5 - si * .8) / (s.duration * .4)) * n;
          let d = '';
          for (let i = 0; i <= Math.min(n, Math.floor(f)); i++) { const p = pts[i % n]; d += (d ? 'L' : 'M') + p[0] + ',' + p[1]; }
          if (f > 0 && f < n) { const i = Math.floor(f), frac = f - i, a = pts[i % n], b = pts[(i + 1) % n]; d += 'L' + mix(a[0], b[0], frac) + ',' + mix(a[1], b[1], frac); }
          if (f >= n) d += ' Z';
          poly.setAttribute('d', d || 'M0,0');
          poly.setAttribute('fill-opacity', String(f >= n ? .16 : 0));
        });
      });
    },
    area() {
      const sp = s.series, X = { min: sp.x.min, max: sp.x.max }, Y = { min: sp.y.min, max: sp.y.max };
      const x0 = 150, y0 = 700, w = 1240, h = 390;
      const px = v => x0 + (v - X.min) / (X.max - X.min) * w;
      const py = v => y0 - (v - Y.min) / (Y.max - Y.min) * h;
      for (let i = 0; i <= 5; i++) { const v = Y.min + (Y.max - Y.min) * i / 5; line(x0, py(v), x0 + w, py(v)); text((sp.y.format || '{v}').replace('{v}', fmt(v, 0)), 96, py(v) + 6, 48, 16, C.muted, k.svg, true, 400, 1.1, 'end'); }
      for (let i = 0; i <= (sp.x.ticks || 6); i++) { const v = X.min + (X.max - X.min) * i / (sp.x.ticks || 6); text((sp.x.format || '{v}').replace('{v}', fmt(v, 0)), px(v) - 22, y0 + 36, 90, 16, C.muted, k.svg, true); }
      const tones = ['blue', 'gold', 'green'];
      let base = null;
      const layers = sp.lines.map((ln2, li) => {
        const pts = s.stacked && base ? ln2.points.map((p, i) => [p[0], p[1] + base[i][1]]) : ln2.points.map(p => [p[0], p[1]]);
        if (s.stacked) base = pts;
        const tone = C[ln2.tone] || C[tones[li % 3]];
        const fill = el('path', { fill: tone, 'fill-opacity': .18, stroke: 'none' });
        const stroke = el('path', { fill: 'none', stroke: tone, 'stroke-width': 2.6 });
        if (ln2.label) text(ln2.label.toUpperCase(), 1310, 320 + li * 42, 240, 17, tone, k.svg, false, 600);
        return { pts, fill, stroke };
      });
      k.updates.push((t, on) => {
        const frac = clamp((on ? t : s.duration) / Math.max(1, s.duration - 3));
        const cut = X.min + (X.max - X.min) * frac;
        for (const layer of layers) {
          let d = '', lastX = null;
          for (const p of layer.pts) { if (p[0] > cut) break; d += (d ? 'L' : 'M') + px(p[0]) + ',' + py(p[1]); lastX = p[0]; }
          layer.stroke.setAttribute('d', d || 'M0,0');
          layer.fill.setAttribute('d', d ? d + `L${px(lastX)},${y0} L${x0},${y0} Z` : 'M0,0');
        }
      });
    },
    candles() {
      const cs = s.candles;
      const lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h));
      const x0 = 160, y0 = 720, w = 1260, h = 420;
      const y = v => y0 - (v - lo) / (hi - lo || 1) * h;
      const cw = Math.min(46, w / cs.length * .64), gap = w / cs.length;
      for (let i = 0; i <= 5; i++) { const v = lo + (hi - lo) * i / 5; line(x0, y(v), x0 + w, y(v)); text((s.format || '{v}').replace('{v}', fmt(v, s.decimals ?? 0)), 104, y(v) + 6, 52, 16, C.muted, k.svg, true, 400, 1.1, 'end'); }
      const step = Math.max(.06, (s.duration - 4) / cs.length);
      cs.forEach((c, i) => {
        const cx2 = x0 + i * gap + gap / 2, up = c.c >= c.o, tone = up ? C.green : C.red;
        const g2 = el('g');
        line(cx2, y(c.h), cx2, y(c.l), tone, 1.6, g2);
        rect(cx2 - cw / 2, y(Math.max(c.o, c.c)), cw, Math.max(2, Math.abs(y(c.o) - y(c.c))), tone, 'none', g2);
        if (c.label && i % Math.ceil(cs.length / 10) === 0) text(String(c.label), cx2, y0 + 36, gap + 40, 15, C.muted, g2, true, 400, 1.1, 'middle');
        k.updates.push((t, on) => g2.style.opacity = String(ease(((on ? t : s.duration) - .4 - i * step) / .45)));
      });
    },
    gantt() {
      const tasks = s.tasks;
      const tmin = Math.min(...tasks.map(task => task.start)), tmax = Math.max(...tasks.map(task => task.end));
      const x0 = 440, w = 1060, rowH = Math.min(64, 440 / tasks.length);
      const X = v => x0 + (v - tmin) / (tmax - tmin || 1) * w;
      for (let i = 0; i <= 5; i++) {
        const v = tmin + (tmax - tmin) * i / 5;
        line(X(v), 285, X(v), 300 + tasks.length * rowH, C.line, 1);
        text((s.format || '{v}').replace('{v}', fmt(v, 0)), X(v) - 24, 272, 110, 15, C.muted, k.svg, true);
      }
      const tones = ['blue', 'gold', 'green', 'amber'];
      tasks.forEach((task, i) => {
        const y = 312 + i * rowH, tone = C[task.tone] || C[tones[i % 4]];
        text(task.label, 65, y + rowH * .42, 350, 21, C.fg, k.svg, false, 500);
        const bar = rect(X(task.start), y, 0, rowH * .52, tone, 'none');
        k.updates.push((t, on) => bar.setAttribute('width', Math.max(0, (X(task.end) - X(task.start)) * ease(((on ? t : s.duration) - .4 - i * .25) / 1))));
      });
      const sweep = line(x0, 285, x0, 300 + tasks.length * rowH, C.gold, 2);
      k.updates.push((t, on) => { const x = x0 + clamp((on ? t : s.duration) / (s.duration - 2)) * w; sweep.setAttribute('x1', x); sweep.setAttribute('x2', x); });
    },
    bullet() {
      const rows = s.rows;
      const rowH = Math.min(120, 470 / rows.length);
      rows.forEach((r, i) => {
        const y = 320 + i * rowH, x0 = 430, w = 950;
        const maxV = r.max || Math.max(r.target * 1.25, r.value * 1.15);
        text(r.label, 65, y + 24, 340, 23, C.fg, k.svg, false, 500);
        (r.bands || [maxV * .5, maxV * .8, maxV]).forEach((b, bi, arr) => rect(x0 + (bi ? arr[bi - 1] / maxV * w : 0), y, (b - (bi ? arr[bi - 1] : 0)) / maxV * w, 40, lerpColor(s.light ? '#dfe4dc' : '#16283a', s.light ? '#b9c6cd' : '#2b4358', bi / arr.length), 'none'));
        const bar = rect(x0, y + 12, 0, 16, C.blue, 'none');
        line(x0 + r.target / maxV * w, y - 7, x0 + r.target / maxV * w, y + 47, C.gold, 4);
        const num = text('', x0 + w + 26, y + 30, 120, 22, C.fg, k.svg, true, 600);
        k.updates.push((t, on) => {
          const pr = ease(((on ? t : s.duration) - .4 - i * .35) / 1.4);
          bar.setAttribute('width', r.value / maxV * w * pr);
          bar.setAttribute('fill', pr >= 1 && r.value >= r.target ? C.green : C.blue);
          change(num, (s.format || '{v}').replace('{v}', fmt(r.value * pr, s.decimals ?? 0)));
        });
      });
    },
    calendar() {
      const days = s.days, maxV = Math.max(...days.map(d => d.value || 0), 1);
      const cols = Math.ceil(days.length / 7), cell = Math.min(60, 1150 / cols, 62);
      const x0 = 340, y0 = 305;
      ['Mon', 'Wed', 'Fri', 'Sun'].forEach((d, i) => text(d, x0 - 18, y0 + (i * 2) * cell + cell * .7, 90, 15, C.muted, k.svg, true, 400, 1.1, 'end'));
      const cells = days.map((d, i) => {
        const col = Math.floor(i / 7), row = i % 7;
        const cellEl = rect(x0 + col * cell + 2, y0 + row * cell + 2, cell - 5, cell - 5, lerpColor(s.light ? '#e8ebe4' : '#101f2d', s.light ? '#946324' : '#dfb976', (d.value || 0) / maxV), 'none');
        return { cellEl, i };
      });
      const readout = text('', x0, y0 + 7 * cell + 56, 900, 21, C.gold, k.svg, true);
      k.updates.push((t, on) => {
        const f = clamp((on ? t : s.duration) / Math.max(1, s.duration - 3)) * days.length;
        for (const { cellEl, i } of cells) cellEl.style.opacity = String(ease((f - i) / 5));
        const idx = Math.min(days.length - 1, Math.floor(f));
        const d = days[idx];
        change(readout, (d.label ? d.label + ' / ' : '') + (s.format || '{v}').replace('{v}', fmt(d.value || 0, s.decimals ?? 0)));
      });
    },
    bump() {
      const rounds = s.rounds, series = s.series;
      const x0 = 250, w = 1000, top = 300, rowH = Math.min(78, 420 / series.length);
      const X = i => x0 + i / (rounds.length - 1) * w;
      const Y = rank => top + (rank - 1) * rowH;
      rounds.forEach((r, i) => text(String(r), X(i) - 30, 276, 120, 16, C.muted, k.svg, true, 400, 1.1, 'middle'));
      for (let rank = 1; rank <= series.length; rank++) text('#' + rank, 200, Y(rank) + 6, 46, 16, C.muted, k.svg, true, 400, 1.1, 'end');
      const tones = ['gold', 'blue', 'green', 'amber', 'red'];
      series.forEach((ser, si) => {
        const tone = C[ser.tone] || C[tones[si % 5]];
        const path = el('path', { fill: 'none', stroke: tone, 'stroke-width': 3 });
        const endLabel = text(ser.label, x0 + w + 30, Y(ser.ranks[ser.ranks.length - 1]) + 7, 260, 20, tone, k.svg, false, 600);
        const dots2 = ser.ranks.map((rank, ri) => dot(X(ri), Y(rank), 0, tone));
        k.updates.push((t, on) => {
          const f = clamp(((on ? t : s.duration) - .4 - si * .3) / Math.max(1, s.duration - 4)) * (rounds.length - 1);
          let d = '';
          for (let i = 0; i <= Math.floor(f); i++) d += (i ? 'L' : 'M') + X(i) + ',' + Y(ser.ranks[i]);
          if (f > 0 && f < rounds.length - 1) { const i = Math.floor(f), frac = f - i; d += 'L' + mix(X(i), X(i + 1), frac) + ',' + mix(Y(ser.ranks[i]), Y(ser.ranks[i + 1]), frac); }
          path.setAttribute('d', d || 'M0,0');
          dots2.forEach((dt, ri) => dt.setAttribute('r', String(ri <= f ? 6 : 0)));
          endLabel.style.opacity = String(f >= rounds.length - 1.02 ? 1 : .15);
        });
      });
    },
    table() {
      const headers = s.headers, rows = s.rows;
      const colW = 1470 / headers.length, xs = headers.map((_, i) => 65 + i * colW);
      headers.forEach((hd, i) => small(String(hd).toUpperCase(), xs[i], 267, colW - 12));
      const batch = Math.ceil(rows.length / k.phaseCount());
      rows.forEach((row, i) => {
        const y = 304 + i * Math.min(68, 470 / rows.length);
        const g = group(Math.floor(i / batch) * .5 + (i % batch) * .12);
        line(65, y + 47, 1535, y + 47, C.line, 1, g);
        row.forEach((cell, j) => text(String(cell), xs[j], y + 8, colW - 16, j === 0 ? 25 : 22, j === 0 ? C.fg : C.muted, g, (s.monoColumns || []).includes(j), j === 0 ? 600 : 400, 1.12));
      });
    },
  };
  layouts[s.layout]();
  return k.finish();
}

/* ---------- sequence: lifelines and messages, animated in order ---------- */
function sequence(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, rect, line, text, group } = k;
  const actors = s.actors, msgs = s.messages || [];
  const colW = 1470 / actors.length;
  const xOf = Object.fromEntries(actors.map((a, i) => [a.id, 65 + colW * i + colW / 2]));
  actors.forEach((a, i) => {
    const g = group(i * .12), x = xOf[a.id];
    rect(x - 130, 262, 260, 62, C.panel, C.line, g);
    text(a.label, x, 301, 240, 24, C.fg, g, false, 600, 1.1, 'middle');
    el('line', { x1: x, y1: 324, x2: x, y2: 742, stroke: C.line, 'stroke-width': 1.4, 'stroke-dasharray': '6 7' }, g);
  });
  const step = Math.max(.9, (s.duration - 4) / Math.max(1, msgs.length));
  const rows = 380, rowH = Math.min(78, 350 / Math.max(1, msgs.length - 1) || 78);
  msgs.forEach((m, i) => {
    const y = rows + i * rowH, a = xOf[m.from], b = xOf[m.to], tone = C[m.tone] || (m.reply ? C.muted : C.blue);
    const g = el('g');
    const dir = b > a ? 1 : -1;
    const path = el('line', { x1: a, y1: y, x2: b - dir * 8, y2: y, stroke: tone, 'stroke-width': m.reply ? 1.6 : 2.6, 'stroke-dasharray': m.reply ? '7 6' : 'none', 'marker-end': `url(#${k.arrowMarker(m.tone || (m.reply ? 'line' : 'blue'))})` }, g);
    const len = Math.abs(b - a);
    path.style.strokeDasharray = m.reply ? '7 6' : String(len);
    text(m.label, (a + b) / 2, y - 14, Math.abs(b - a) - 30, 19, m.reply ? C.muted : C.fg, g, m.mono, 500, 1.1, 'middle');
    k.updates.push((t, on) => {
      const p = ease(((on ? t : s.duration) - .8 - i * step) / .7);
      g.style.opacity = String(p);
      if (!m.reply) path.style.strokeDashoffset = String(len * (1 - p));
    });
  });
  return k.finish();
}

/* ---------- venn ---------- */
function venn(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, text } = k;
  const sets = s.sets;
  const centers = sets.length === 2 ? [[640, 520], [960, 520]] : [[640, 440], [960, 440], [800, 660]];
  const tones = ['blue', 'gold', 'green'];
  const circles = sets.map((set, i) => {
    const c = el('circle', { cx: centers[i][0], cy: centers[i][1], r: 230, fill: C[tones[i]], 'fill-opacity': .13, stroke: C[tones[i]], 'stroke-width': 2.4 });
    const labelPos = sets.length === 2 ? [i === 0 ? 430 : 1170, 520] : [[430, 380], [1170, 380], [800, 800]][i];
    text(set.label, labelPos[0], labelPos[1], 300, 30, C[tones[i]], k.svg, false, 600, 1.15, 'middle');
    if (set.note) text(set.note, labelPos[0], labelPos[1] + 40, 300, 19, C.muted, k.svg, false, 400, 1.3, 'middle');
    return c;
  });
  const overlap = s.overlapLabel ? text(s.overlapLabel, sets.length === 2 ? 800 : 800, sets.length === 2 ? 528 : 512, 240, 26, C.fg, k.svg, false, 600, 1.2, 'middle') : null;
  k.updates.push((t, on) => {
    const tt = on ? t : s.duration;
    circles.forEach((c, i) => {
      const p = ease((tt - .3 - i * .5) / 1.2);
      c.setAttribute('r', String(230 * Math.max(.001, p)));
      c.style.opacity = String(p);
      c.setAttribute('stroke-width', tt > s.duration * .62 ? '1.4' : '2.4');
    });
    if (overlap) overlap.style.opacity = String(ease((tt - s.duration * .55) / 1));
  });
  return k.finish();
}

/* ---------- pyramid ---------- */
function pyramid(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, text } = k;
  const levels = s.levels, n = levels.length;
  const top = 280, bottom = 745, h = (bottom - top) / n, cx = 620, maxW = 860;
  const tones = ['gold', 'blue', 'green', 'amber', 'red'];
  levels.forEach((level, i) => {
    const wTop = maxW * (i / n) + 90, wBot = maxW * ((i + 1) / n) + 90;
    const y0 = top + i * h, y1 = y0 + h - 8;
    const g = el('g');
    el('path', { d: `M${cx - wTop / 2},${y0} L${cx + wTop / 2},${y0} L${cx + wBot / 2},${y1} L${cx - wBot / 2},${y1} Z`, fill: C.panel, stroke: C[tones[i % 5]], 'stroke-width': 2 }, g);
    text(level.title, cx, y0 + h / 2 - (level.body ? 8 : -4), wTop + 40, 26, C.fg, g, false, 600, 1.1, 'middle');
    if (level.body) text(level.body, cx, y0 + h / 2 + 22, wTop + 60, 17, C.muted, g, false, 400, 1.2, 'middle');
    const side = text(level.note || '', 1180, y0 + h / 2, 350, 20, C.muted, k.svg);
    k.updates.push((t, on) => {
      const order = s.topDown ? i : n - 1 - i;
      const p = ease(((on ? t : s.duration) - .3 - order * .55) / .9);
      g.style.opacity = String(p);
      g.style.transform = `translateY(${(1 - p) * 14}px)`;
      side.style.opacity = String(p);
    });
  });
  return k.finish();
}

/* ---------- tree: hierarchy staged by depth ---------- */
function tree(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, rect, text } = k;
  const leaves = nodeSpec => nodeSpec.children && nodeSpec.children.length ? nodeSpec.children.reduce((total, c) => total + leaves(c), 0) : 1;
  let depthMax = 0;
  const placed = [];
  (function place(nodeSpec, depth, x0, x1, parent) {
    depthMax = Math.max(depthMax, depth);
    const x = (x0 + x1) / 2, y = 300 + depth * 150;
    placed.push({ spec: nodeSpec, x, y, depth, parent });
    let cursor = x0;
    for (const child of nodeSpec.children || []) {
      const w = (x1 - x0) * leaves(child) / leaves(nodeSpec);
      place(child, depth + 1, cursor, cursor + w, { x, y });
      cursor += w;
    }
  })(s.root, 0, 65, 1535, null);
  const tones = ['gold', 'blue', 'green', 'amber'];
  for (const p of placed) {
    const g = el('g', { 'data-depth': p.depth });
    if (p.parent) {
      const link = el('path', { d: `M${p.parent.x},${p.parent.y + 36} C${p.parent.x},${p.y - 90} ${p.x},${p.y - 110} ${p.x},${p.y - 36}`, fill: 'none', stroke: C.line, 'stroke-width': 1.6 }, g);
      const len = link.getTotalLength();
      link.style.strokeDasharray = String(len);
      p.link = link; p.linkLen = len;
    }
    const w = Math.min(250, 1420 / Math.pow(2, p.depth) - 14);
    rect(p.x - w / 2, p.y - 36, w, 72, C.panel, C[p.spec.tone || tones[p.depth % 4]], g);
    text(p.spec.label, p.x, p.y - (p.spec.body ? 6 : -8), w - 22, Math.min(24, w / 8), C.fg, g, false, 600, 1.05, 'middle');
    if (p.spec.body) text(p.spec.body, p.x, p.y + 20, w - 22, 14, C.muted, g, false, 400, 1.1, 'middle');
    p.g = g;
  }
  k.updates.push((t, on) => {
    const tt = on ? t : s.duration;
    for (const p of placed) {
      const pr = ease((tt - .25 - p.depth * .8 - (p.x / 3000)) / .8);
      p.g.style.opacity = String(pr);
      if (p.link) p.link.style.strokeDashoffset = String(p.linkLen * (1 - pr));
    }
  });
  return k.finish();
}

/* ---------- network: deterministic shell layout, animated edges ---------- */
function network(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, el, text } = k;
  const nodes = s.nodes, links = s.links || [];
  const degree = Object.fromEntries(nodes.map(n2 => [n2.id, 0]));
  links.forEach(l => { degree[l.from]++; degree[l.to]++; });
  const sorted = [...nodes].sort((a, b) => degree[b.id] - degree[a.id]);
  const pos = {};
  const cx = 800, cy = 520;
  sorted.forEach((n2, i) => {
    if (i === 0) { pos[n2.id] = [cx, cy]; return; }
    const ringIdx = i <= 6 ? 0 : 1;
    const ringCount = ringIdx === 0 ? Math.min(6, sorted.length - 1) : sorted.length - 7;
    const idx = ringIdx === 0 ? i - 1 : i - 7;
    const r = ringIdx === 0 ? 195 : 330;
    const angle = idx / ringCount * Math.PI * 2 - Math.PI / 2 + ringIdx * .35;
    pos[n2.id] = [cx + Math.cos(angle) * r * 1.55, cy + Math.sin(angle) * r * .82];
  });
  const edges = links.map((l, i) => {
    const [x1, y1] = pos[l.from], [x2, y2] = pos[l.to];
    const path = el('path', { d: `M${x1},${y1} L${x2},${y2}`, stroke: C[l.tone] || C.line, 'stroke-width': l.tone ? 2.4 : 1.4, fill: 'none', opacity: .8 });
    const len = Math.hypot(x2 - x1, y2 - y1);
    path.style.strokeDasharray = String(len);
    return { path, len, i };
  });
  const tones = ['gold', 'blue', 'green', 'amber', 'red'];
  const dots = nodes.map((n2, i) => {
    const [x, y] = pos[n2.id];
    const g = el('g');
    const r = 14 + Math.min(26, degree[n2.id] * 5) * (n2.size || 1);
    el('circle', { cx: x, cy: y, r, fill: C.panel, stroke: C[n2.tone || tones[i % 5]], 'stroke-width': degree[n2.id] > 2 ? 3 : 1.6 }, g);
    text(n2.label, x, y + r + 26, 220, 18, C.fg, g, false, 500, 1.1, 'middle');
    return g;
  });
  k.updates.push((t, on) => {
    const tt = on ? t : s.duration;
    dots.forEach((g, i) => g.style.opacity = String(ease((tt - .2 - i * .14) / .7)));
    edges.forEach(({ path, len, i }) => path.style.strokeDashoffset = String(len * (1 - ease((tt - .9 - i * .22) / 1))));
  });
  return k.finish();
}

/* ---------- wordcloud: deterministic spiral placement ---------- */
function wordcloud(stage, s, deck) {
  const k = svgScene(stage, s, deck);
  const { C, text } = k;
  const words = [...s.words].sort((a, b) => (b.weight || 1) - (a.weight || 1));
  const maxW = words[0].weight || 1, minW = words[words.length - 1].weight || 1;
  const boxes = [];
  const tones = [C.fg, C.blue, C.gold, C.muted, C.green];
  const cx2 = 800, cy2 = 520;
  const els = words.map((word, i) => {
    const size = 22 + Math.pow((word.weight - minW) / Math.max(.001, maxW - minW), .8) * 76;
    measure.font = `600 ${size}px ${C.fontBody}`;
    const w = measure.measureText(word.text).width + 18, h = size * 1.15;
    let x = cx2, y = cy2;
    for (let step2 = 0; step2 < 3000; step2++) {
      const a = step2 * .32, r = 3.2 * Math.sqrt(step2) * (1 + (i % 3) * .13);
      x = cx2 + Math.cos(a + i) * r * 1.65;
      y = cy2 + Math.sin(a + i) * r * .75;
      const box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (box[0] < 70 || box[2] > 1530 || box[1] < 265 || box[3] > 810) continue;
      if (!boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) { boxes.push(box); break; }
    }
    const e = text(word.text, x, y + size * .34, w + 40, size, word.tone ? C[word.tone] : tones[i % tones.length], k.svg, false, 600, 1, 'middle');
    return e;
  });
  k.updates.push((t, on) => {
    const tt = on ? t : s.duration;
    els.forEach((e, i) => {
      const p = ease((tt - .2 - i * (Math.max(1, s.duration - 4) / words.length)) / .7);
      e.style.opacity = String(p);
    });
  });
  return k.finish();
}

/* ---------- geo: a compact procedural landmask shared by globe and dotmap ---------- */
const CONTINENTS = [
  [[-168, 66], [-140, 70], [-90, 72], [-60, 60], [-55, 48], [-75, 35], [-80, 25], [-97, 15], [-105, 20], [-120, 35], [-130, 55], [-168, 60]],
  [[-80, 10], [-60, 5], [-50, 0], [-35, -8], [-40, -25], [-55, -40], [-72, -52], [-75, -30], [-80, -5]],
  [[-45, 60], [-20, 70], [-30, 82], [-60, 78], [-55, 65]],
  [[-17, 15], [0, 35], [10, 37], [32, 31], [43, 12], [51, 10], [40, -15], [32, -30], [18, -35], [10, -15], [-10, 5]],
  [[-10, 36], [0, 44], [-5, 50], [0, 59], [10, 58], [20, 55], [30, 60], [40, 65], [45, 45], [25, 40], [15, 38]],
  [[30, 60], [40, 68], [60, 72], [90, 74], [110, 72], [130, 70], [150, 65], [160, 60], [140, 50], [130, 35], [120, 25], [105, 15], [100, 5], [95, 15], [80, 10], [75, 20], [60, 25], [45, 30], [35, 40], [30, 50]],
  [[115, -20], [130, -12], [140, -12], [150, -25], [145, -38], [130, -32], [115, -32]],
];
function inPoly(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
let LANDMASK = null;
function landDots(stepDeg = 3) {
  if (LANDMASK) return LANDMASK;
  LANDMASK = [];
  for (let lat = -58; lat <= 78; lat += stepDeg)
    for (let lon = -180; lon < 180; lon += stepDeg)
      if (CONTINENTS.some(poly => inPoly(lon, lat, poly))) LANDMASK.push([lon, lat]);
  return LANDMASK;
}

/* ---------- globe: rotating dot globe with great-circle arcs ---------- */
function globe(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    canvasChrome(g, C, h, s, deck, '', '');
    const cx3 = 800, cy3 = s.title ? 565 : 450, R = s.title ? 270 : 330;
    const spin = (s.rotate ?? 12) * t * Math.PI / 180 + (s.startLon || -80) * Math.PI / 180;
    const project = (lon, lat) => {
      const lam = lon * Math.PI / 180 - spin, phi = lat * Math.PI / 180;
      const x = Math.cos(phi) * Math.sin(lam), y2 = Math.sin(phi), z = Math.cos(phi) * Math.cos(lam);
      return { x: cx3 + x * R, y: cy3 - y2 * R * .96, front: z > -.05, z };
    };
    g.beginPath(); g.arc(cx3, cy3, R + 4, 0, Math.PI * 2); g.strokeStyle = C.line; g.lineWidth = 1.2; g.stroke();
    for (const [lon, lat] of landDots()) {
      const p = project(lon, lat);
      if (!p.front) continue;
      g.globalAlpha = .28 + .5 * p.z;
      h.dot([p.x, p.y], 2.1, C.blue);
    }
    g.globalAlpha = 1;
    const markers = s.markers || [];
    markers.forEach((mk, i) => {
      const p = project(mk.lon, mk.lat);
      if (!p.front) return;
      const appear = ease((t - 1 - i * .4) / .8);
      h.dot([p.x, p.y], 6 * appear, C.gold);
      const pulse = ((t * .8 + i * .37) % 1);
      g.beginPath(); g.arc(p.x, p.y, 6 + pulse * 22, 0, Math.PI * 2);
      g.strokeStyle = C.gold; g.globalAlpha = (1 - pulse) * .6 * appear; g.lineWidth = 1.4; g.stroke(); g.globalAlpha = 1;
      if (mk.label) h.txt(p.x + 14, p.y + 5, mk.label, 17, C.fg, C.fontBody, 600);
    });
    (s.arcs || []).forEach((arc, i) => {
      const from = markers[arc.from] || arc.from, to = markers[arc.to] || arc.to;
      const a = project(from.lon, from.lat), b = project(to.lon, to.lat);
      if (!a.front && !b.front) return;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * .3;
      const p = h.clamp((t - 2 - i * .8) / 1.6);
      if (p <= 0) return;
      g.beginPath(); g.moveTo(a.x, a.y);
      const steps = 32;
      for (let q = 1; q <= steps * p; q++) {
        const u = q / steps;
        g.lineTo((1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x, (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y);
      }
      g.strokeStyle = C.gold; g.lineWidth = 1.8; g.stroke();
    });
    if (s.caption) h.txt(800, 828, s.caption, 16, C.muted, C.fontBody, 400, 'center');
  });
}

/* ---------- dotmap: flat equirectangular dot map with pulsing markers ---------- */
function dotmap(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    canvasChrome(g, C, h, s, deck, '', '');
    const x0 = 140, y0 = 270, w = 1320, hh2 = 500;
    const project = (lon, lat) => [x0 + (lon + 180) / 360 * w, y0 + (78 - lat) / 136 * hh2];
    for (const [lon, lat] of landDots()) {
      const [x, y] = project(lon, lat);
      g.globalAlpha = .5;
      h.dot([x, y], 2.2, s.light ? '#9fb4c4' : '#2e4a63');
    }
    g.globalAlpha = 1;
    (s.markers || []).forEach((mk, i) => {
      const [x, y] = project(mk.lon, mk.lat);
      const appear = ease((t - .6 - i * .35) / .7);
      if (appear <= 0) return;
      h.dot([x, y], (4 + (mk.size || 1) * 2.5) * appear, C.gold);
      const pulse = ((t * .7 + i * .41) % 1);
      g.beginPath(); g.arc(x, y, 5 + pulse * 26, 0, Math.PI * 2);
      g.strokeStyle = C.gold; g.globalAlpha = (1 - pulse) * .55 * appear; g.lineWidth = 1.3; g.stroke(); g.globalAlpha = 1;
      if (mk.label) h.txt(x + 12, y - 8, mk.label + (mk.value !== undefined ? ' / ' + mk.value : ''), 16, C.fg, C.fontBody, 600);
    });
    if (s.caption) h.txt(800, 828, s.caption, 16, C.muted, C.fontBody, 400, 'center');
  });
}

/* ---------- race: an animated bar-chart race across rounds ---------- */
function race(stage, s, deck) {
  return canvasScene(stage, s, deck, (g, t, C, h) => {
    canvasChrome(g, C, h, s, deck, '', '');
    const rounds = s.rounds;
    const names = [...new Set(rounds.flatMap(r => r.values.map(v => v.name)))];
    const pos = h.clamp(t / (s.duration - 3)) * (rounds.length - 1);
    const i0 = Math.floor(pos), i1 = Math.min(rounds.length - 1, i0 + 1), frac = ease(pos - i0);
    const valueAt = (round, name) => { const found = round.values.find(v => v.name === name); return found ? found.value : 0; };
    const interp = names.map(name => ({ name, value: mix(valueAt(rounds[i0], name), valueAt(rounds[i1], name), pos - i0) }));
    const rankOf = list => { const sorted = [...list].sort((a, b) => b.value - a.value); return Object.fromEntries(sorted.map((entry, i) => [entry.name, i])); };
    const ranksA = rankOf(names.map(name => ({ name, value: valueAt(rounds[i0], name) })));
    const ranksB = rankOf(names.map(name => ({ name, value: valueAt(rounds[i1], name) })));
    const maxV = Math.max(...interp.map(entry => entry.value), 1);
    const rowH = Math.min(72, 480 / names.length), x0 = 420, w = 1000;
    const tones = [C.gold, C.blue, C.green, C.amber, C.red];
    h.txt(1500, 320, rounds[i0 + (frac > .5 ? 1 : 0)].label, 54, C.gold, C.fontMono, 400, 'right');
    interp.forEach((entry, ni) => {
      const y = 300 + mix(ranksA[entry.name], ranksB[entry.name], frac) * (rowH + 14);
      const bw = entry.value / maxV * w;
      g.fillStyle = tones[ni % tones.length];
      g.globalAlpha = .92;
      g.fillRect(x0, y, Math.max(2, bw), rowH);
      g.globalAlpha = 1;
      h.txt(x0 - 18, y + rowH * .68, entry.name, 24, C.fg, C.fontBody, 600, 'right');
      h.txt(x0 + bw + 16, y + rowH * .68, (s.format || '{v}').replace('{v}', Math.round(entry.value).toLocaleString()), 22, C.muted, C.fontMono);
    });
    if (s.caption) h.txt(800, 828, s.caption, 16, C.muted, C.fontBody, 400, 'center');
  });
}

/* ---------- custom: the escape hatch ---------- */
function custom(stage, s, deck) {
  const data = Object.assign({}, deck.data, s.data);
  try {
    if (s.mode === 'canvas') {
      const draw = new Function('g', 't', 'C', 'scene', 'data', 'h', s.code);
      return canvasScene(stage, s, deck, (g, t, C, h) => draw(g, t, C, s, data, h));
    }
    const k = svgScene(stage, s, deck);
    const api = Object.assign({}, k, { scene: s, data, clamp, mix, ease, fmt, onUpdate: fn => k.updates.push(fn) });
    new Function('api', s.code)(api);
    return k.finish();
  } catch (err) {
    stage.replaceChildren();
    const placard = node('div', 'ds-error');
    placard.textContent = `Scene "${s.id}" failed: ${err.message}`;
    stage.append(placard);
    return { update() {}, count: 0, error: String(err) };
  }
}

const registry = {
  hero, statement, elements, diagram, chart, film, image, custom,
  lanes: lanesScene, trajectory: trajectoryScene, matrix: matrixScene, cycle: cycleScene,
  quote, bullets, stats, gallery, wall, people, countdown, terminal, code,
  sequence, venn, pyramid, tree, network, wordcloud, globe, dotmap, race,
};

function mount(stage, scene, deck) {
  const engine = registry[scene.type];
  if (!engine) { const p = node('div', 'ds-error'); p.textContent = `Unknown scene type "${scene.type}"`; stage.append(p); return { update() {}, count: 0 }; }
  return engine(stage, scene, deck);
}

window.DS = { mount, registry, palette, svgScene, clamp, ease, mix, fmt };
})();
