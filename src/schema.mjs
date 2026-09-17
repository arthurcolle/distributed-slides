// Scene specification reference and deck validation.
// Every animated scene is a pure function of the presenter clock:
// mount(stage, scene, deck) -> { update(seconds, motionEnabled), count }.
// That contract is what makes scrubbing, playback speed and audience-window
// sync deterministic, and it is shared by every scene type below.

export const DEFAULT_DURATIONS = {
  hero: 25, statement: 15, elements: 20, diagram: 40, chart: 15,
  film: 30, image: 12, custom: 20,
  lanes: 30, trajectory: 24, matrix: 30, cycle: 32,
  quote: 12, bullets: 18, stats: 14, gallery: 16, wall: 14, people: 16,
  countdown: 20, terminal: 18, code: 18, sequence: 24, venn: 16, pyramid: 18,
  tree: 22, network: 20, wordcloud: 16, globe: 26, dotmap: 20, race: 24,
};

export const COMMON_FIELDS = {
  id: 'Unique scene id (lowercase, hyphens).',
  type: 'One of: hero, statement, elements, diagram, chart, film, image, custom.',
  title: 'Complete-thought headline shown on the scene and in the index.',
  subtitle: 'Supporting line under the title (chrome scenes).',
  chapter: 'Chapter label shown in the presenter context bar.',
  duration: 'Animation length in seconds. The scrubber, captions and choreography all key off this.',
  notes: 'Presenter speaking notes (never shown to the audience).',
  cue: 'The first sentence to say when this scene appears (shown to the presenter on the PREVIOUS scene as the transition line).',
  deliveryCue: 'One-line stage direction for the presenter.',
  phases: 'Array of {title, body}. Caption bar cycles through them across the scene duration. Chrome scenes only.',
  footnote: 'Small provenance/caveat line at the bottom of chrome scenes.',
  source: 'Provenance string shown in the presenter "Source" panel.',
  light: 'true renders the scene on the light (paper) palette instead of midnight.',
  palette: 'Per-scene palette overrides, e.g. {"gold": "#c89b4a"}.',
  chrome: 'false disables the standard header/footer chrome on diagram/chart/custom scenes.',
  originalImage: 'Optional static image path; the presenter O key toggles it in place of the animated scene.',
};

export const SCENE_TYPES = {
  hero: {
    purpose: 'Full-bleed opening/section slide: art image with gradient shade, eyebrow, balanced headline, subtitle. Slow 35s art drift plus staggered text rise.',
    fields: {
      art: 'Asset path (relative to assets/) for the full-bleed image. Optional; falls back to a themed gradient.',
      eyebrow: 'Small letterspaced line above the headline.',
      subtitle: 'Multi-line supporting copy ("\\n" separated).',
      credit: 'Small credit line, bottom left.',
    },
  },
  statement: {
    purpose: 'A single typographic thought, centered. Eyebrow, statement, optional supporting body. Rise choreography.',
    fields: {
      eyebrow: 'Small letterspaced line above.',
      body: 'Supporting paragraph below the statement.',
      align: '"center" (default) or "left".',
    },
  },
  elements: {
    purpose: 'Choreographed free-form slide: absolutely positioned boxes, text, images and connectors on a 1280x720 canvas, each entering with its own timing. This is the format PPTX extractions or fully custom layouts compile to. Auto-choreography assigns delay/duration/mode from position and role; any element can override with "enter".',
    fields: {
      background: 'CSS background for the slide (color or gradient).',
      elements: `Array of element objects:
  {x, y, w, h}            geometry in 1280x720 space
  kind                    "box" (default) | "image" | "connector"
  geometry                "rect" | "roundRect" | "ellipse" | "line"
  fill, stroke, strokeWidth
  src, crop:[l,t,r,b]     image source (assets/...) and fractional crop
  text: [{text, size, color, bold, align, lineHeight}]
  anchor                  "t" | "ctr" | "b"  (vertical text anchor)
  insets: [t,r,b,l]       text padding in px
  name                    "title-*" names get headline choreography
  id, from, to, head      connectors join element ids; head/tail "triangle" draws arrowheads
  flipH, flipV            connector direction flips
  enter: {mode, delay, duration}
                          mode: rise | fade | reveal | line | bar | art | connector`,
    },
  },
  diagram: {
    purpose: 'Staged system diagram on the standard chrome: nodes with tone-coded spines, auto-routed orthogonal edges with arrowheads, animated draw-on and traveling dots, phase-gated stages. The audience watches the system assemble in the order you narrate it.',
    fields: {
      nodes: 'Array of {id, x, y, w, h, title, body, tone: blue|gold|green|red|amber, stage: 0..phases-1}.',
      edges: 'Array of {from, to, stage, tone, points?: [[x,y],...] } — points override auto-routing. Coordinates are 1600x900.',
      labels: 'Optional array of {text, x, y, w, size?, tone?, mono?} free annotations.',
    },
  },
  chart: {
    purpose: 'Declarative animated chart on the standard chrome. Five layouts, all clock-driven.',
    fields: {
      layout: '"bars" | "series" | "timeline" | "columns" | "table" | "cadence" | "donut" | "gauge" | "scatter" | "heatmap" | "histogram" | "waterfall" | "slope" | "funnel" | "radar" | "area" | "candles" | "gantt" | "bullet" | "calendar" | "bump"',
      bars: 'layout=bars: rows [{label, value, display?, note?, tone?}], max?, unit? — bars grow staggered, values count up.',
      series: 'layout=series: {x:{min,max,label,format?}, y:{min,max,label,format?}, lines:[{label, tone, points:[[x,y],...]}]} — progressive reveal with head dot and live right-rail readout.',
      timeline: 'layout=timeline: items [{title, body, tone?}], band?: {from, to, text, tone} — dots along a line, traveling cursor, highlighted span.',
      columns: 'layout=columns: columns [{title, tone, boxes:[{title, body}]}] — staggered panels with underline sweep.',
      table: 'layout=table: headers [..], rows [[..],..], monoColumns?: [indexes] — rows fade in by batch.',
      cadence: 'layout=cadence: rows [{label, intervalSec, offsetSec?}], windowSec?:3600, headline?, headlineSub?, caption? — schedule tick rows with a sweeping cursor.',
      donut: 'layout=donut: segments [{label, value, tone?}], centerLabel?, format? — arc sweep with counting legend.',
      gauge: 'layout=gauge: value, max?, label?, bands?:[{to, tone}], format? — needle sweep with count-up readout.',
      scatter: 'layout=scatter: points [{x, y, label?, tone?, r?}], x?/y?:{min,max,format}, quadrants?:{labels:[4]} — staggered point pops, optional 2×2 quadrant frame.',
      heatmap: 'layout=heatmap: rows [..], cols [..], values [[..]], showValues?, format? — cells reveal column by column on a color ramp.',
      histogram: 'layout=histogram: bins [{label, count}], overlay? — bars rise, optional curve draws over.',
      waterfall: 'layout=waterfall: steps [{label, delta}], total?, totalLabel?, format? — cumulative bars with dashed connectors, sequential.',
      slope: 'layout=slope: left?, right?, lines [{label, a, b, tone?}], format? — before/after slopes drawing left to right.',
      funnel: 'layout=funnel: stages [{label, value}], note?, format? — trapezoids reveal top-down with conversion percentages.',
      radar: 'layout=radar: axes [..], series [{label, values:[0..1], tone?}] — the polygon sweeps around the web axis by axis.',
      area: 'layout=area: series (same shape as layout=series), stacked? — progressive filled areas.',
      candles: 'layout=candles: candles [{o, h, l, c, label?}], format? — OHLC candles reveal sequentially, up green / down red.',
      gantt: 'layout=gantt: tasks [{label, start, end, tone?}], format? — bars grow along a shared time axis with a sweep cursor.',
      bullet: 'layout=bullet: rows [{label, value, target, max?, bands?}], format? — KPI bullet bars with target ticks; green when target met.',
      calendar: 'layout=calendar: days [{label?, value}], format? — a 7-row heat calendar filling day by day with a live readout.',
      bump: 'layout=bump: rounds [..], series [{label, ranks:[..], tone?}] — rank lines drawing across rounds, labels land at the end.',
    },
  },
  film: {
    purpose: 'Video scene. The shell owns play/pause/seek so scrubbing and audience sync behave exactly like animated scenes.',
    fields: { src: 'Video path (assets/...).', poster: 'Poster image path.' },
  },
  image: {
    purpose: 'Full-frame still with a slow settle (Ken Burns out) and optional caption.',
    fields: { src: 'Image path (assets/...).', caption: 'Caption line under the image.', fit: '"contain" (default) or "cover".' },
  },
  lanes: {
    purpose: 'Multi-lane time series drawn in perspective (the price-topography scene): each lane keeps its own identity, the current leader draws in gold, missing values stay gaps. flat:true renders an undistorted heatmap comparison.',
    fields: {
      lanes: 'Data object (or use dataRef into deck.data): {labels:[...], states:[{minute, values:[v|null,...]}], xMax?:1440, scale?:100, format?:"{v}¢", decimals?, highlightTitle?, notes?:[..2], caption?, flatCaption?, clockUnit?}. values are normalized 0..1.',
      dataRef: 'Key in deck.data holding the lanes object.',
      flat: 'true = flat heatmap rows instead of perspective.',
    },
  },
  trajectory: {
    purpose: 'An x × y × time state path (the phase-space scene): the trail draws minute by minute, the last 90 minutes glow gold, gaps in the source stay gaps, and a rail shows the latest matched pair.',
    fields: {
      trajectory: 'Data object (or dataRef): {points:[{x, y, minute}], tMax?:1440, x?:{min,max,format:"{v}°F"}, y?:{min,max,step,format:"{v}¢"}, gap?:10, trailWindow?:90, panelTitle?, notes?:[..2], caption?, clockUnit?}.',
      dataRef: 'Key in deck.data holding the trajectory object.',
    },
  },
  matrix: {
    purpose: 'Small multiples with independent clocks (the twenty-city matrix): up to 5×N panels of mini bar strips, each panel offset from a shared sweeping clock; the selected panel gets a gold ring and a full readout row.',
    fields: {
      matrix: 'Data object (or dataRef): {panels:[{label, offset (hours), barLabels:[...], states:[{minute, values:[...]}]}], clock?:{start, span, unit}, scale?:100, format?:"{v}¢", emptyLabel?}.',
      selected: 'Index of the highlighted panel (default 0).',
      selectRotate: 'true = highlight rotates across panels over the scene duration.',
    },
  },
  cycle: {
    purpose: 'A staged loop diagram with a retained-artifact panel (the learning-loop scene): N steps arranged in a serpentine cycle, the active step advances with the clock, and the right rail explains what artifact that step must persist.',
    fields: {
      steps: 'Array (3–8) of {title, artifact, detail}.',
      centerLabel: 'Label inside the loop.',
      panelHeading: 'Right-rail heading (default RETAINED ARTIFACT).',
      panelFooter: 'Gold closing line in the right rail.',
      clockUnit: 'Top-right unit label, e.g. WORKFLOW / NOT TELEMETRY.',
    },
  },
  quote: {
    purpose: 'A single serif quotation with attribution. For the sentence someone else said better.',
    fields: { title: 'The quotation (also accepts text).', attribution: 'Who said it.', role: 'Their role/source line.' },
  },
  bullets: {
    purpose: 'The classic list, choreographed: items rise one per beat across the scene duration.',
    fields: { kicker: 'Small letterspaced line above the title.', items: 'Array of strings or {text, detail}.', side: 'Optional {src} image beside the list.' },
  },
  stats: {
    purpose: 'KPI tiles that count up with the clock. Tabular numerals, tone-coded top rules.',
    fields: { tiles: 'Array of {label, value, prefix?, suffix?, decimals?, note?, tone?}.' },
  },
  gallery: {
    purpose: 'Image mosaic with staggered wipe reveals and optional captions.',
    fields: { images: 'Array of {src, caption?} or path strings.', columns: 'Grid columns (auto by count).' },
  },
  wall: {
    purpose: 'A logo/name wall: bordered cells fading in by row. Social proof, stack slides, sponsor walls.',
    fields: { items: 'Array of strings or {src, alt}.', columns: 'Grid columns.' },
  },
  people: {
    purpose: 'Team grid: avatar (image or initials), name, role, staggered rise.',
    fields: { people: 'Array of {name, role?, src?, initials?}.', columns: 'Grid columns.' },
  },
  countdown: {
    purpose: 'A break slide: a large timer counting the scene clock down inside a progress ring.',
    fields: { seconds: 'Countdown length (defaults to scene duration).', label: 'Line above the clock, e.g. BACK IN.' },
  },
  terminal: {
    purpose: 'A terminal session typed by the clock: commands type character-by-character, output prints in blocks. Scrub it like everything else.',
    fields: { lines: 'Array of {cmd?, out?} in order.', prompt: 'Prompt string (default "$ ").', host: 'Titlebar label.' },
  },
  code: {
    purpose: 'Code with line-by-line reveal, gutter numbers, gold highlight lines, and a tiny zero-dependency tokenizer (strings/keywords/numbers/comments).',
    fields: { code: 'The source text.', highlights: 'Array of 1-based line numbers to emphasize.', title: 'Heading above the block.' },
  },
  sequence: {
    purpose: 'A sequence diagram on the standard chrome: actor boxes, dashed lifelines, messages drawing on in narrated order (dashed replies).',
    fields: { actors: 'Array of {id, label}.', messages: 'Array of {from, to, label, reply?, tone?, mono?} in time order.' },
  },
  venn: {
    purpose: 'Two or three overlapping sets; circles scale in, the intersection gets emphasized late.',
    fields: { sets: 'Array (2–3) of {label, note?}.', overlapLabel: 'Label for the intersection.' },
  },
  pyramid: {
    purpose: 'A layered hierarchy triangle revealing bottom-up (or top-down), with optional side notes per layer.',
    fields: { levels: 'Array of {title, body?, note?}, top layer first.', topDown: 'true reveals from the top.' },
  },
  tree: {
    purpose: 'An org-chart / hierarchy tree laid out automatically, links drawing on depth by depth.',
    fields: { root: 'Nested {label, body?, tone?, children:[...]}.' },
  },
  network: {
    purpose: 'A relationship graph with deterministic hub-and-shell auto-layout: node size follows degree, edges draw on staggered.',
    fields: { nodes: 'Array of {id, label, tone?, size?}.', links: 'Array of {from, to, tone?}.' },
  },
  wordcloud: {
    purpose: 'A deterministic spiral word cloud (same layout every render), fading in by weight rank.',
    fields: { words: 'Array of {text, weight, tone?}.' },
  },
  globe: {
    purpose: 'A rotating dot-matrix globe (stylized continents, no geo dependency) with pulsing markers and great-circle arcs. The rotation derives from the clock, so it scrubs.',
    fields: { markers: 'Array of {lat, lon, label?, size?}.', arcs: 'Array of {from, to} (marker indexes or {lat, lon}).', rotate: 'Degrees per second (default 12).', startLon: 'Initial center longitude.', caption: 'Bottom caption.' },
  },
  dotmap: {
    purpose: 'A flat dot-matrix world map with pulsing gold markers. Same stylized landmask as globe.',
    fields: { markers: 'Array of {lat, lon, label?, value?, size?}.', caption: 'Bottom caption.' },
  },
  race: {
    purpose: 'A bar-chart race across rounds: bars grow, swap ranks and interpolate smoothly under the clock.',
    fields: { rounds: 'Array of {label, values: [{name, value}]} in order.', format: 'Value format, e.g. "${v}".', caption: 'Bottom caption.' },
  },
  custom: {
    purpose: 'The escape hatch that makes anything expressible: bespoke scenes (3D-feel price topography, phase-space plots, city matrices) are JavaScript bodies compiled into the deck. SVG mode gets the full chrome + primitive kit; canvas mode gets a raw 1600x900 2d context redrawn every frame.',
    fields: {
      mode: '"svg" (default) or "canvas".',
      code: `SVG mode: body of function(api). api = {svg, C (palette), scene, data (deck.data), el, rect, line, dot, text, small, value, group, box, flow, path, onUpdate(fn), clamp, mix, ease}.
  Build the scene once with the primitives, then register onUpdate((t, enabled) => ...) callbacks; t is the scene clock in seconds.
Canvas mode: body of function(g, t, C, scene, data, h). Called every frame; g is the 1600x900 2d context. h = {txt, wrapped, ln, dot, clamp, mix, ease, fmt}. Draw the whole frame from t — never accumulate state.`,
      data: 'Optional scene-local data object, also reachable as scene.data.',
    },
  },
};

export function sceneReference(type) {
  if (type) {
    if (!SCENE_TYPES[type]) throw new Error(`Unknown scene type "${type}".`);
    return { type, common: COMMON_FIELDS, ...SCENE_TYPES[type], defaultDuration: DEFAULT_DURATIONS[type] };
  }
  return {
    contract: 'mount(stage, scene, deck) -> {update(seconds, motionEnabled), count}. All motion derives from the presenter clock; scrub, speed and audience sync come for free.',
    common: COMMON_FIELDS,
    types: Object.fromEntries(Object.entries(SCENE_TYPES).map(([k, v]) => [k, v.purpose])),
    defaultDurations: DEFAULT_DURATIONS,
  };
}

const TONES = new Set(['blue', 'gold', 'green', 'red', 'amber']);

export function validateScene(scene, deck) {
  const problems = [];
  const warn = m => problems.push({ level: 'warning', scene: scene.id, message: m });
  const err = m => problems.push({ level: 'error', scene: scene.id, message: m });

  if (!scene.id || !/^[a-z0-9][a-z0-9-]*$/.test(scene.id)) err('Scene id must be lowercase letters/digits/hyphens.');
  if (!SCENE_TYPES[scene.type]) err(`Unknown type "${scene.type}".`);
  if (!scene.title) warn('No title; index/search and presenter panels will be blank.');
  if (scene.duration !== undefined && !(scene.duration > 0)) err('duration must be > 0 seconds.');
  if (scene.phases && !Array.isArray(scene.phases)) err('phases must be an array of {title, body}.');

  switch (scene.type) {
    case 'elements': {
      if (!Array.isArray(scene.elements) || !scene.elements.length) { err('elements array is required.'); break; }
      const ids = new Set(scene.elements.filter(e => e.id).map(e => String(e.id)));
      scene.elements.forEach((e, i) => {
        if (e.kind !== 'connector' && ![e.x, e.y, e.w, e.h].every(Number.isFinite)) err(`element[${i}] needs numeric x/y/w/h.`);
        if (e.kind === 'connector' && (e.from || e.to)) {
          for (const ref of [e.from, e.to]) if (ref && !ids.has(String(ref))) warn(`connector element[${i}] references missing id "${ref}".`);
        }
        if (e.enter && e.enter.mode && !['rise', 'fade', 'reveal', 'line', 'bar', 'art', 'connector'].includes(e.enter.mode)) err(`element[${i}] enter.mode "${e.enter.mode}" unknown.`);
      });
      break;
    }
    case 'diagram': {
      if (!Array.isArray(scene.nodes) || !scene.nodes.length) { err('nodes array is required.'); break; }
      const ids = new Set(scene.nodes.map(n => n.id));
      for (const n of scene.nodes) {
        if (n.tone && !TONES.has(n.tone)) warn(`node "${n.id}" tone "${n.tone}" unknown; using blue.`);
        if (![n.x, n.y, n.w, n.h].every(Number.isFinite)) err(`node "${n.id}" needs numeric x/y/w/h.`);
      }
      for (const e of scene.edges || []) {
        if (!ids.has(e.from) || !ids.has(e.to)) err(`edge ${e.from}->${e.to} references a missing node.`);
      }
      break;
    }
    case 'chart': {
      const L = scene.layout;
      const NEEDS = {
        bars: 'bars', timeline: 'items', columns: 'columns', cadence: 'rows', donut: 'segments',
        scatter: 'points', histogram: 'bins', waterfall: 'steps', slope: 'lines', funnel: 'stages',
        radar: 'axes', candles: 'candles', gantt: 'tasks', bullet: 'rows', calendar: 'days', bump: 'series',
      };
      if (!(L in NEEDS) && !['series', 'table', 'gauge', 'heatmap', 'area'].includes(L)) { err(`chart layout "${L}" unknown.`); break; }
      if (NEEDS[L] && !Array.isArray(scene[NEEDS[L]])) err(`${L} layout needs a ${NEEDS[L]} array.`);
      if ((L === 'series' || L === 'area') && !(scene.series && Array.isArray(scene.series.lines))) err(`${L} layout needs series.lines.`);
      if (L === 'table' && !(Array.isArray(scene.headers) && Array.isArray(scene.rows))) err('table layout needs headers and rows.');
      if (L === 'gauge' && !Number.isFinite(scene.value)) err('gauge layout needs a numeric value.');
      if (L === 'heatmap' && !(Array.isArray(scene.rows) && Array.isArray(scene.cols) && Array.isArray(scene.values))) err('heatmap layout needs rows, cols and values.');
      if (L === 'bump' && !Array.isArray(scene.rounds)) err('bump layout needs rounds.');
      break;
    }
    case 'lanes': {
      const m = scene.lanes;
      if (!m && !scene.dataRef) err('lanes needs a lanes object or dataRef into deck.data.');
      if (m && !(Array.isArray(m.labels) && Array.isArray(m.states))) err('lanes.labels and lanes.states are required.');
      if (m && m.labels && (m.labels.length < 2 || m.labels.length > 8)) warn('lanes reads best with 2–8 lanes.');
      break;
    }
    case 'trajectory': {
      const m = scene.trajectory;
      if (!m && !scene.dataRef) err('trajectory needs a trajectory object or dataRef into deck.data.');
      if (m && !Array.isArray(m.points)) err('trajectory.points is required.');
      break;
    }
    case 'matrix': {
      const m = scene.matrix;
      if (!m && !scene.dataRef) err('matrix needs a matrix object or dataRef into deck.data.');
      if (m && !Array.isArray(m.panels)) err('matrix.panels is required.');
      break;
    }
    case 'cycle':
      if (!Array.isArray(scene.steps) || scene.steps.length < 3 || scene.steps.length > 8) err('cycle needs 3–8 steps of {title, artifact, detail}.');
      break;
    case 'quote':
      if (!scene.title && !scene.text) err('quote needs the quotation in title or text.');
      break;
    case 'bullets':
      if (!Array.isArray(scene.items) || !scene.items.length) err('bullets needs an items array.');
      break;
    case 'stats':
      if (!Array.isArray(scene.tiles) || !scene.tiles.length) err('stats needs a tiles array.');
      break;
    case 'gallery':
      if (!Array.isArray(scene.images) || !scene.images.length) err('gallery needs an images array.');
      break;
    case 'wall':
      if (!Array.isArray(scene.items) || !scene.items.length) err('wall needs an items array.');
      break;
    case 'people':
      if (!Array.isArray(scene.people) || !scene.people.length) err('people needs a people array.');
      break;
    case 'terminal':
      if (!Array.isArray(scene.lines) || !scene.lines.length) err('terminal needs a lines array of {cmd?, out?}.');
      break;
    case 'code':
      if (!scene.code) err('code needs a code string.');
      break;
    case 'sequence':
      if (!Array.isArray(scene.actors) || scene.actors.length < 2) err('sequence needs at least 2 actors.');
      if (!Array.isArray(scene.messages) || !scene.messages.length) err('sequence needs a messages array.');
      break;
    case 'venn':
      if (!Array.isArray(scene.sets) || scene.sets.length < 2 || scene.sets.length > 3) err('venn needs 2 or 3 sets.');
      break;
    case 'pyramid':
      if (!Array.isArray(scene.levels) || scene.levels.length < 2) err('pyramid needs at least 2 levels.');
      break;
    case 'tree':
      if (!scene.root || !scene.root.label) err('tree needs a root node with a label.');
      break;
    case 'network':
      if (!Array.isArray(scene.nodes) || !scene.nodes.length) err('network needs a nodes array.');
      else {
        const ids = new Set(scene.nodes.map(n => n.id));
        for (const l of scene.links || []) if (!ids.has(l.from) || !ids.has(l.to)) err(`network link ${l.from}->${l.to} references a missing node.`);
      }
      break;
    case 'wordcloud':
      if (!Array.isArray(scene.words) || !scene.words.length) err('wordcloud needs a words array of {text, weight}.');
      break;
    case 'globe':
    case 'dotmap':
      for (const mk of scene.markers || []) if (!Number.isFinite(mk.lat) || !Number.isFinite(mk.lon)) err(`${scene.type} marker needs numeric lat/lon.`);
      break;
    case 'race':
      if (!Array.isArray(scene.rounds) || scene.rounds.length < 2) err('race needs at least 2 rounds of {label, values}.');
      break;
    case 'film':
      if (!scene.src) err('film needs src.');
      break;
    case 'image':
      if (!scene.src) err('image needs src.');
      break;
    case 'custom':
      if (!scene.code || typeof scene.code !== 'string') err('custom needs a code string.');
      else {
        try {
          scene.mode === 'canvas'
            ? new Function('g', 't', 'C', 'scene', 'data', 'h', scene.code)
            : new Function('api', scene.code);
        } catch (e) { err(`custom code does not parse: ${e.message}`); }
      }
      break;
    case 'hero':
      if (!scene.title) err('hero needs a title.');
      break;
  }
  if (deck) {
    for (const key of ['art', 'src', 'poster', 'originalImage']) {
      const v = scene[key];
      if (typeof v === 'string' && !/^(https?:)?\/\//.test(v)) problems.push({ level: 'asset', scene: scene.id, message: `${key}: ${v}` });
    }
  }
  return problems;
}

export function validateDeck(deck, assetExists) {
  const problems = [];
  const seen = new Set();
  for (const s of deck.scenes) {
    if (seen.has(s.id)) problems.push({ level: 'error', scene: s.id, message: 'Duplicate scene id.' });
    seen.add(s.id);
    for (const p of validateScene(s, deck)) {
      if (p.level === 'asset') {
        const rel = p.message.split(': ')[1];
        if (assetExists && !assetExists(rel)) problems.push({ level: 'warning', scene: s.id, message: `Asset not found in deck assets: ${rel}` });
      } else problems.push(p);
    }
  }
  for (const [name, ids] of Object.entries(deck.routes)) {
    for (const id of ids) if (!seen.has(id)) problems.push({ level: 'error', route: name, message: `Route references missing scene "${id}".` });
  }
  if (!deck.scenes.length) problems.push({ level: 'warning', message: 'Deck has no scenes.' });
  return problems;
}
