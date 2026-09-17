/* slides.distributed.systems — the demos on this page are real mounts of engine.js.
   Each player drives handle.update(t) from its own clock; nothing is a video. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
const DECK = { brand: 'DISTRIBUTED SLIDES', badge: 'LIVE / RENDERED BY THE ENGINE', theme: {}, data: {} };

/* ---------- stage scaling ---------- */
const scaler = new ResizeObserver(entries => {
  for (const e of entries) {
    const frame = e.target.querySelector('.frame');
    if (frame) frame.style.transform = `scale(${e.target.clientWidth / 1600})`;
  }
});
const watchStage = el => scaler.observe(el);

/* ---------- demo data ---------- */
const lanes = {
  city: 'Boston', labels: ['58-59°', '60-61°', '62-63°', '64-65°', '66-67°', '68°+'],
  format: '{v}¢', highlightTitle: 'HIGHEST MIDPOINT',
  notes: ['Each lane keeps its own series identity.', 'Values are not normalized against each other.'],
  states: Array.from({ length: 145 }, (_, q) => ({
    minute: q * 10,
    values: Array.from({ length: 6 }, (_, b) => {
      const peak = 2.6 + 2.2 * Math.sin(q / 145 * Math.PI);
      const v = Math.exp(-Math.pow(b - peak, 2) / 1.4);
      return q % 29 === 7 && b === 5 ? null : Math.round(v * 88) / 100;
    }),
  })),
};

const LANES_CODE = `
const m = data.lanes, T = h.clamp(t / (scene.duration - 4)) * 1440;
h.txt(65, 48, 'DISTRIBUTED SLIDES / CUSTOM CANVAS SCENE', 16, C.muted, C.fontBody, 600);
h.wrapped(65, 141, scene.title, 1220, 43);
h.txt(65, 215, m.city + ' / six synthetic quote lanes / 0-100c', 19, C.muted);
h.ln([65, 238], [1535, 238], C.line);
const P = (minute, price, b) => [110 + minute / 1440 * 880 + b * 43, 770 - b * 49 - price * 240];
for (let b = 5; b >= 0; b--) {
  for (const q of [0, .5, 1]) h.ln(P(0, q, b), P(1440, q, b), q === 0 ? '#496078' : '#203449');
  h.txt(P(1440, 0, b)[0] + 15, P(1440, 0, b)[1] + 6, m.labels[b], 18, C.muted);
  g.beginPath();
  let valid = false;
  for (const q of m.states) {
    if (q.minute > T) break;
    const v = q.values[b];
    if (v === null) { valid = false; continue; }
    const pp = P(q.minute, v, b);
    valid ? g.lineTo(...pp) : g.moveTo(...pp);
    valid = true;
  }
  g.strokeStyle = b === 3 ? C.gold : C.blue; g.lineWidth = b === 3 ? 3.2 : 2.1; g.stroke();
}
for (let hr = 0; hr <= 24; hr += 6) { const q = P(hr * 60, 0, 0); h.txt(q[0], q[1] + 30, String(hr).padStart(2, '0') + ':00', 15, C.muted, C.fontMono, 400, 'center'); }
h.ln([65, 843], [1535, 843], C.line);
h.txt(65, 874, 'Synthetic replay / gaps remain gaps / drawn entirely from t', 14, C.muted);
`;

const HERO_SCENES = [
  {
    scene: {
      id: 'live-system', type: 'diagram', duration: 30,
      title: 'The diagram engine assembles a system in narrated stages',
      subtitle: 'Nodes carry tone-coded spines; edges auto-route, draw on, and carry traveling dots.',
      chapter: 'THE ENGINES', footnote: 'Synthetic demonstration topology.',
      phases: [
        { title: 'Sources produce evidence', body: 'Collectors preserve records with source and time.' },
        { title: 'Workers derive state', body: 'Derived records are readable by any process.' },
        { title: 'Serving and evaluation reuse the records', body: 'The same identifiers travel end to end.' },
      ],
      nodes: [
        { id: 'src', x: 65, y: 270, w: 280, h: 150, title: 'Sources', body: 'Feeds and venues', tone: 'blue', stage: 0 },
        { id: 'collect', x: 430, y: 270, w: 300, h: 150, title: 'Collectors', body: 'Continuous ingestion', tone: 'blue', stage: 0 },
        { id: 'db', x: 820, y: 255, w: 320, h: 185, title: 'Shared store', body: 'Evidence and derived records', tone: 'gold', stage: 1 },
        { id: 'work', x: 430, y: 520, w: 300, h: 150, title: 'Workers', body: 'Forecast and decide', tone: 'green', stage: 1 },
        { id: 'api', x: 1230, y: 270, w: 300, h: 150, title: 'Serving API', body: 'People, programs, models', tone: 'blue', stage: 2 },
        { id: 'grade', x: 1230, y: 520, w: 300, h: 150, title: 'Evaluation', body: 'Grades against outcomes', tone: 'amber', stage: 2 },
      ],
      edges: [
        { from: 'src', to: 'collect', stage: 0 }, { from: 'collect', to: 'db', stage: 0 },
        { from: 'db', to: 'work', stage: 1 }, { from: 'work', to: 'db', stage: 1 },
        { from: 'db', to: 'api', stage: 2 }, { from: 'db', to: 'grade', stage: 2, tone: 'amber' },
      ],
    },
    chapter: 'SCENE TYPE: DIAGRAM',
    cue: 'Watch the stages land in the order you would narrate them.',
    notes: 'Every node, edge and traveling dot is positioned by JSON your agent wrote through the MCP — then choreographed by the clock.',
  },
  {
    scene: {
      id: 'live-lanes', type: 'lanes', duration: 26, lanes,
      title: 'The lanes engine: six series in perspective, as a first-class type',
      chapter: 'THE DATA ENGINES',
      footnote: 'Synthetic replay. Gaps in the source remain gaps on screen.',
    },
    chapter: 'SCENE TYPE: LANES',
    cue: 'The topography is now a built-in.',
    notes: 'The HEAT price topography, extracted: this scene is data plus one JSON spec — no code. Note the gap in the top lane: missing quotes stay missing.',
  },
  {
    scene: {
      id: 'live-series', type: 'chart', layout: 'series', duration: 20,
      title: 'Series reveal progressively with a live readout',
      subtitle: 'Declarative chart layouts: bars, series, timeline, columns, table.',
      chapter: 'THE ENGINES', footnote: 'Synthetic diurnal curve.',
      phases: [
        { title: 'The line draws from the clock', body: 'Scrub backwards and it un-draws.' },
        { title: 'The readout follows the head', body: 'Latest value, always in step.' },
        { title: 'The final frame holds', body: 'Reduced motion renders the end state.' },
      ],
      series: {
        x: { min: 0, max: 24, label: 'Hour of day', ticks: 6 }, y: { min: 40, max: 90, format: '{v}°' },
        lines: [
          { label: 'Observed', tone: 'blue', points: Array.from({ length: 49 }, (_, i) => [i / 2, 62 + 14 * Math.sin((i / 2 - 6) / 24 * Math.PI * 2) + (i % 5) * .6]) },
          { label: 'Forecast', tone: 'gold', points: Array.from({ length: 49 }, (_, i) => [i / 2, 63 + 13 * Math.sin((i / 2 - 6.5) / 24 * Math.PI * 2)]) },
        ],
      },
    },
    chapter: 'SCENE TYPE: CHART',
    cue: 'Five chart layouts ship in the box.',
    notes: 'No chart library. The engine draws SVG with the same primitive kit custom scenes get, so everything obeys the same clock.',
  },
];

/* ---------- hero player ---------- */
function heroPlayer() {
  const stageWrap = $('#hero-stage-wrap'), stage = $('#hero-stage');
  const playBtn = $('#hero-play'), scrub = $('#hero-scrub'), time = $('#hero-time'), dots = $('#hero-dots');
  watchStage(stageWrap);
  let current = 0, handle = null, t = 0, playing = !reduced, lastFrame = performance.now();
  const mm = s => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  HERO_SCENES.forEach((entry, i) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', entry.scene.title);
    b.onclick = () => show(i, true);
    dots.append(b);
  });

  function show(i, andPlay) {
    current = i;
    const entry = HERO_SCENES[i];
    stage.replaceChildren();
    handle = window.DS.mount(stage, entry.scene, DECK);
    t = 0; lastFrame = performance.now();
    playing = andPlay && !reduced;
    if (reduced) { t = entry.scene.duration; handle.update(t, false); }
    $('#stage-chapter').textContent = entry.chapter;
    $('#hero-cue').textContent = entry.cue;
    $('#hero-notes').textContent = entry.notes;
    [...dots.children].forEach((d, j) => d.setAttribute('aria-selected', String(j === current)));
  }
  function frame(now) {
    const entry = HERO_SCENES[current], dur = entry.scene.duration;
    const dt = Math.min(.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (playing) {
      t += dt;
      if (t >= dur + 1.2) { show((current + 1) % HERO_SCENES.length, true); requestAnimationFrame(frame); return; }
    }
    const tt = Math.min(t, dur);
    handle.update(tt, true);
    playBtn.textContent = playing ? 'Pause' : 'Play';
    scrub.value = Math.round(tt / dur * 1000);
    time.textContent = `${mm(tt)} / ${mm(dur)}`;
    requestAnimationFrame(frame);
  }
  playBtn.onclick = () => { if (t >= HERO_SCENES[current].scene.duration) t = 0; playing = !playing; lastFrame = performance.now(); };
  scrub.oninput = e => { t = +e.target.value / 1000 * HERO_SCENES[current].scene.duration; playing = false; };
  show(0, true);
  requestAnimationFrame(frame);
}

/* ---------- engine type cards ---------- */
const svgArt = (hue) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><radialGradient id="g" cx="70%" cy="20%" r="90%"><stop offset="0%" stop-color="${hue}"/><stop offset="60%" stop-color="#0d1c2c"/><stop offset="100%" stop-color="#05090f"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g stroke="#d5ad66" stroke-width="2" fill="none" opacity=".8"><circle cx="800" cy="450" r="210"/><circle cx="800" cy="450" r="160" opacity=".5"/><path d="M800 240 L800 200 M800 660 L800 700 M590 450 L550 450 M1010 450 L1050 450"/></g><circle cx="800" cy="450" r="8" fill="#d5ad66"/></svg>`);

const CARDS = [
  { name: 'hero', tag: 'DOM', desc: 'Full-bleed art, gradient shade, balanced headline. Slow drift plus staggered rise.',
    scene: { id: 'c-hero', type: 'hero', duration: 14, title: 'A talk opens like a film', eyebrow: 'DISTRIBUTED SLIDES', subtitle: 'Art, shade, headline, subtitle —\nfour entrances, one clock.', credit: 'hero scene / live mount' } },
  { name: 'statement', tag: 'DOM', desc: 'One typographic thought, centered, choreographed. For the sentence the room should remember.',
    scene: { id: 'c-stmt', type: 'statement', duration: 12, eyebrow: 'THE CONTRACT', title: 'Decks are specs. Performances are compiled.', body: 'statement scene / live mount' } },
  { name: 'elements', tag: 'DOM', desc: 'Free-form boxes, text, images, self-drawing connectors on a 1280×720 grid. PPTX-extraction compatible.',
    scene: { id: 'c-elem', type: 'elements', duration: 14, background: '#F5F4EF', elements: [
      { id: 't', name: 'title-1', x: 64, y: 70, w: 1120, h: 120, text: [{ text: 'Any layout, any timing', size: 46, color: '#0C1524', bold: true, align: 'l' }] },
      { id: 'a', x: 90, y: 280, w: 300, h: 130, geometry: 'roundRect', fill: '#FFFFFF', stroke: '#B8C7D8', strokeWidth: 1.5, anchor: 'ctr', insets: [14, 18, 14, 18], text: [{ text: 'Observation', size: 26, color: '#0C1524', bold: true, align: 'ctr' }] },
      { id: 'b', x: 500, y: 280, w: 300, h: 130, geometry: 'roundRect', fill: '#FFFFFF', stroke: '#B8C7D8', strokeWidth: 1.5, anchor: 'ctr', insets: [14, 18, 14, 18], text: [{ text: 'Decision', size: 26, color: '#0C1524', bold: true, align: 'ctr' }] },
      { id: 'c', x: 910, y: 280, w: 300, h: 130, geometry: 'roundRect', fill: '#0C1524', strokeWidth: 0, anchor: 'ctr', insets: [14, 18, 14, 18], text: [{ text: 'Record', size: 26, color: '#FFFFFF', bold: true, align: 'ctr' }] },
      { kind: 'connector', from: 'a', to: 'b', x: 0, y: 0, w: 0, h: 0, stroke: '#215BEB', strokeWidth: 3, head: 'triangle' },
      { kind: 'connector', from: 'b', to: 'c', x: 0, y: 0, w: 0, h: 0, stroke: '#215BEB', strokeWidth: 3, head: 'triangle' },
      { x: 90, y: 520, w: 1100, h: 60, text: [{ text: 'Connectors route themselves between elements. Arrowheads and timing are automatic.', size: 24, color: '#3D4C5E', align: 'l' }] },
    ] } },
  { name: 'diagram', tag: 'SVG + CHROME', desc: 'Staged system graphs: tone-coded spines, auto-routed edges, traveling dots, phase captions.',
    scene: { ...HERO_SCENES[0].scene, id: 'c-diag', duration: 18 } },
  { name: 'chart', tag: 'SVG + CHROME', desc: 'Twenty-one clock-driven layouts: bars, series, donut, radar, waterfall, candles, gantt… No chart library.',
    scene: { id: 'c-bars', type: 'chart', layout: 'bars', duration: 12, title: 'Bars grow and count in step with the clock', chapter: 'THE ENGINES',
      phases: [{ title: 'Staggered entry', body: '' }, { title: 'Values count up', body: '' }, { title: 'End state holds', body: '' }],
      bars: [
        { label: 'Scene engines', value: 8, display: '8 engines', tone: 'blue' },
        { label: 'Chart layouts', value: 5, display: '5 layouts', tone: 'gold' },
        { label: 'Runtime dependencies', value: .4, display: '0 deps', tone: 'green' },
      ], max: 8 } },
  { name: 'film', tag: 'VIDEO', desc: 'The shell owns play, pause and seek, so film scenes scrub and sync exactly like animated ones.',
    scene: { id: 'c-film', type: 'film', duration: 10, title: 'Film scene', src: '', poster: svgArt('#1d3a5f') } },
  { name: 'image', tag: 'DOM', desc: 'Full-frame stills with a slow settle and caption. For the photograph that needs no motion.',
    scene: { id: 'c-img', type: 'image', duration: 12, title: 'Image scene', src: svgArt('#2b4a72'), caption: 'image scene / slow settle / live mount' } },
  { name: 'lanes', tag: 'CANVAS', desc: 'Multi-lane time series in perspective — the price topography as a first-class type. Gaps stay gaps.',
    scene: { id: 'c-lanes-native', type: 'lanes', duration: 16, title: 'Six series in perspective', lanes } },
  { name: 'trajectory', tag: 'CANVAS', desc: 'An x × y × time state path. The last 90 minutes glow gold; the rail reads the latest matched pair.',
    scene: { id: 'c-traj', type: 'trajectory', duration: 16, title: 'Temperature × price × time',
      trajectory: {
        x: { format: '{v}°F' }, y: { min: 0, max: 100, step: 20, format: '{v}¢' },
        notes: ['The same x value can appear at different y values.'],
        points: Array.from({ length: 288 }, (_, i) => {
          const minute = i * 5, temp = 62 + 14 * Math.sin((minute / 60 - 6) / 24 * Math.PI * 2);
          return { minute, x: Math.round(temp * 10) / 10, y: Math.round(Math.exp(-Math.pow(temp - 68, 2) / 30) * 80 + i % 7) };
        }).filter((_, i) => i % 13 !== 5),
      } } },
  { name: 'matrix', tag: 'CANVAS', desc: 'Small multiples with independent clocks: one shared sweep, per-panel offsets, a gold ring on the selected panel.',
    scene: { id: 'c-matrix', type: 'matrix', duration: 16, selectRotate: true, title: 'Ten panels, one shared clock',
      matrix: {
        clock: { start: 480, span: 900, unit: 'UTC / SHARED CLOCK' }, format: '{v}¢',
        panels: Array.from({ length: 10 }, (_, p) => ({
          label: ['Boston', 'New York', 'Chicago', 'Denver', 'Seattle', 'Austin', 'Miami', 'Phoenix', 'Atlanta', 'Portland'][p],
          offset: [5, 5, 6, 7, 8, 6, 5, 7, 5, 8][p],
          barLabels: ['58', '60', '62', '64', '66', '68'],
          states: Array.from({ length: 97 }, (_, q) => ({
            minute: q * 15,
            values: Array.from({ length: 6 }, (_, b) => Math.round(Math.exp(-Math.pow(b - (1.5 + p % 4 + q / 97 * 2), 2) / 1.6) * 90) / 100),
          })),
        })),
      } } },
  { name: 'cycle', tag: 'CANVAS', desc: 'A staged loop with a retained-artifact rail. The active step advances with the clock.',
    scene: { id: 'c-cycle', type: 'cycle', duration: 18, title: 'A workflow loop with retained artifacts',
      clockUnit: 'WORKFLOW / NOT TELEMETRY', centerLabel: 'Responsibility survives the handoff',
      panelFooter: 'The model can change. This record persists.',
      steps: [
        { title: 'Observation', artifact: 'Timestamped evidence', detail: 'Preserve the source, path and observation time.' },
        { title: 'Belief', artifact: 'Versioned forecast', detail: 'Keep the model version and its evidence.' },
        { title: 'Pricing', artifact: 'Contract proposal', detail: 'Map belief to the venue geometry.' },
        { title: 'Act or wait', artifact: 'Action receipt', detail: 'Record the order or the decision to wait.' },
        { title: 'Settlement', artifact: 'External outcome', detail: 'Attach the official result.' },
        { title: 'Evaluation', artifact: 'Accepted comparison', detail: 'Grade forecast and execution separately.' },
      ] } },
  { name: 'custom', tag: 'SVG OR CANVAS', desc: 'The escape hatch: scenes as code with the full primitive kit. Anything is expressible.',
    scene: { id: 'c-lanes', type: 'custom', mode: 'canvas', duration: 16, title: 'Six quote lanes in perspective', data: { lanes }, code: LANES_CODE } },
];

function engineCards() {
  const grid = $('#engine-grid');
  for (const card of CARDS) {
    const el = document.createElement('article');
    el.className = 'engine-card reveal';
    el.innerHTML = `<div class="engine-mini"><div class="frame"></div></div>
      <div class="engine-meta"><p class="engine-name">${card.name}<small>${card.tag}</small></p>
      <p class="engine-desc">${card.desc}</p></div>`;
    grid.append(el);
    const mini = el.querySelector('.engine-mini'), frame = el.querySelector('.frame');
    watchStage(mini);
    let handle;
    try { handle = window.DS.mount(frame, card.scene, DECK); } catch { continue; }
    const freeze = card.scene.duration * .62;
    if (!handle.media) handle.update(freeze, true);
    let raf = null, t0 = 0;
    const loop = now => {
      const t = Math.min((now - t0) / 1000, card.scene.duration);
      handle.update(t, true);
      if (t < card.scene.duration) raf = requestAnimationFrame(loop);
    };
    el.addEventListener('mouseenter', () => {
      if (reduced || handle.media) return;
      cancelAnimationFrame(raf);
      t0 = performance.now();
      raf = requestAnimationFrame(loop);
    });
    el.addEventListener('mouseleave', () => { cancelAnimationFrame(raf); if (!handle.media) handle.update(freeze, true); });
  }
}

/* ---------- tool ledger ---------- */
const TOOLS = [
  ['create_deck', 'Start a deck: title, brand, badge, theme.', 1],
  ['scene_reference', 'Self-documenting spec for all 30 scene types.', 1],
  ['add_scene', 'Append or insert a scene, validated on entry.', 1],
  ['update_scene', 'Patch or replace a scene by id.'],
  ['remove_scene', 'Delete a scene and drop it from every route.'],
  ['move_scene', 'Reorder the master scene list.'],
  ['set_route', 'Define a named run of show — the 25-minute cut.', 1],
  ['set_data', 'Attach real datasets for scenes to draw from.'],
  ['add_asset', 'Copy art, stills and films into the deck.'],
  ['validate_deck', 'Specs, routes, custom-code parses, missing assets.'],
  ['build_deck', 'Compile one self-contained offline folder.', 1],
  ['preview_deck', 'Serve the build on localhost, in the background.'],
  ['stop_preview', 'Stop the preview server.'],
  ['get_deck', 'Summary or the full spec.'],
  ['update_deck', 'Patch deck-level fields.'],
  ['list_decks', 'Every deck, with scene counts and routes.'],
  ['delete_deck', 'Remove a deck entirely.'],
  ['export_pdf', 'One storyboard PDF, every scene frozen at its final frame.', 1],
  ['export_gifs', 'A GIF per scene plus a zero-JS gallery — a copy for humans.', 1],
];
function toolLedger() {
  const host = $('#tool-ledger');
  for (const [name, desc, hot] of TOOLS) {
    const row = document.createElement('div');
    row.className = 'tool-row' + (hot ? ' tool-hot' : '');
    row.innerHTML = `<code>${name}</code><span>${desc}</span>`;
    host.append(row);
  }
}

/* ---------- reveals + copy buttons ---------- */
function reveals() {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}
document.querySelectorAll('.copy').forEach(b => b.onclick = () => {
  navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1600); });
});

engineCards();
toolLedger();
heroPlayer();
reveals();
})();
