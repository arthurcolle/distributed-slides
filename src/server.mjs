#!/usr/bin/env node
// Distributed-Slides MCP server (stdio, newline-delimited JSON-RPC 2.0).
// Zero dependencies. Tools create, edit, validate, build and preview animated
// slide experiences; output decks are fully offline and self-contained.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as store from './store.mjs';
import { buildDeck } from './build.mjs';
import { sceneReference, validateDeck, validateScene, DEFAULT_DURATIONS, SCENE_TYPES } from './schema.mjs';

const VERSION = '0.1.0';
const SERVE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'serve.mjs');

/* ---------------- tool implementations ---------------- */

function requireScene(deck, id) {
  const i = deck.scenes.findIndex(s => s.id === id);
  if (i < 0) throw new Error(`Scene "${id}" not found in deck "${deck.id}".`);
  return i;
}
const summarize = deck => ({
  id: deck.id, title: deck.title, subtitle: deck.subtitle, brand: deck.brand,
  scenes: deck.scenes.map(s => ({ id: s.id, type: s.type, title: s.title, duration: s.duration, chapter: s.chapter })),
  routes: Object.fromEntries(Object.entries(deck.routes).map(([k, v]) => [k, v.length])),
  dataKeys: Object.keys(deck.data || {}),
  updatedAt: deck.updatedAt,
});

const tools = {
  create_deck: {
    description: 'Create a new deck. A deck compiles into a fully offline presentation app: presenter view with speaking notes, next-scene preview and transition cues, synchronized audience window, rehearsal clock, scrubber, remote/clicker support and deterministic clock-driven animations.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deck id (lowercase, hyphens).' },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        brand: { type: 'string', description: 'Wordmark shown top-left in the presenter shell and in scene chrome. Default DISTRIBUTED SYSTEMS.' },
        brandTag: { type: 'string', description: 'Small line under the wordmark.' },
        badge: { type: 'string', description: 'Top-right label on chrome scenes (e.g. RESEARCH PREVIEW / SEPTEMBER 16).' },
        footer: { type: 'string', description: 'Provenance disclaimer shown in the presenter Source panel.' },
        theme: { type: 'object', description: 'Optional palette/font overrides: {dark:{...}, light:{...}, shell:{bg,fg,blue,gold,line,quiet}, fontBody, fontMono}.' },
        rehearsalCueSeconds: { type: 'number' },
      },
      required: ['id', 'title'],
    },
    run: a => summarize(store.newDeck(a)),
  },
  list_decks: {
    description: 'List all decks with scene counts and routes.',
    schema: { type: 'object', properties: {} },
    run: () => store.listDecks(),
  },
  get_deck: {
    description: 'Get a deck. Returns a summary by default; pass full:true for the complete spec including every scene body.',
    schema: { type: 'object', properties: { deck: { type: 'string' }, full: { type: 'boolean' } }, required: ['deck'] },
    run: a => a.full ? store.loadDeck(a.deck) : summarize(store.loadDeck(a.deck)),
  },
  update_deck: {
    description: 'Patch deck-level fields: title, subtitle, brand, brandTag, badge, footer, theme, defaultRoute, rehearsalCueSeconds.',
    schema: { type: 'object', properties: { deck: { type: 'string' }, patch: { type: 'object' } }, required: ['deck', 'patch'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const allowed = ['title', 'subtitle', 'brand', 'brandTag', 'badge', 'footer', 'theme', 'defaultRoute', 'rehearsalCueSeconds', 'routeLabels'];
      for (const [k, v] of Object.entries(a.patch)) {
        if (!allowed.includes(k)) throw new Error(`Field "${k}" is not patchable. Allowed: ${allowed.join(', ')}.`);
        deck[k] = v;
      }
      return summarize(store.saveDeck(deck));
    },
  },
  delete_deck: {
    description: 'Delete a deck and all of its assets and builds. Irreversible.',
    schema: { type: 'object', properties: { deck: { type: 'string' } }, required: ['deck'] },
    run: a => { store.deleteDeck(a.deck); return { deleted: a.deck }; },
  },
  scene_reference: {
    description: 'The scene specification reference. Call with no arguments for the overview of all 8 scene types and the animation contract; pass type for full field documentation of one type. Read this before authoring scenes.',
    schema: { type: 'object', properties: { type: { type: 'string', enum: Object.keys(SCENE_TYPES) } } },
    run: a => sceneReference(a.type),
  },
  add_scene: {
    description: 'Add a scene to a deck. The scene object must include id, type and title; see scene_reference for per-type fields (hero, statement, elements, diagram, chart, film, image, custom). Common fields: chapter, duration, notes (presenter speaking notes), cue (transition line), deliveryCue, phases [{title,body}], footnote, light, source. Scenes append to the "performance" route automatically unless route:false.',
    schema: {
      type: 'object',
      properties: {
        deck: { type: 'string' },
        scene: { type: 'object', description: 'Scene spec. See scene_reference.' },
        position: { type: 'number', description: 'Insert at this index (default: append).' },
        route: { type: ['boolean', 'string'], description: 'false = do not add to a route; a string = route name to append to. Default "performance".' },
      },
      required: ['deck', 'scene'],
    },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const scene = a.scene;
      if (deck.scenes.some(s => s.id === scene.id)) throw new Error(`Scene id "${scene.id}" already exists.`);
      if (scene.duration === undefined) scene.duration = DEFAULT_DURATIONS[scene.type] || 20;
      const problems = validateScene(scene, deck).filter(p => p.level === 'error');
      if (problems.length) throw new Error('Scene rejected:\n' + problems.map(p => '- ' + p.message).join('\n'));
      const at = a.position === undefined ? deck.scenes.length : Math.max(0, Math.min(deck.scenes.length, a.position));
      deck.scenes.splice(at, 0, scene);
      if (a.route !== false) {
        const routeName = typeof a.route === 'string' ? a.route : 'performance';
        deck.routes[routeName] = deck.routes[routeName] || [];
        if (!deck.routes[routeName].includes(scene.id)) deck.routes[routeName].push(scene.id);
      }
      store.saveDeck(deck);
      return { added: scene.id, position: at, scenes: deck.scenes.length, warnings: validateScene(scene, deck).filter(p => p.level === 'warning') };
    },
  },
  update_scene: {
    description: 'Patch a scene by id (merge fields), or pass replace:true to substitute the whole scene object.',
    schema: {
      type: 'object',
      properties: {
        deck: { type: 'string' }, id: { type: 'string' },
        patch: { type: 'object' }, replace: { type: 'boolean' },
      },
      required: ['deck', 'id', 'patch'],
    },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const i = requireScene(deck, a.id);
      const next = a.replace ? { id: a.id, ...a.patch } : { ...deck.scenes[i], ...a.patch };
      next.id = a.id;
      const problems = validateScene(next, deck).filter(p => p.level === 'error');
      if (problems.length) throw new Error('Scene rejected:\n' + problems.map(p => '- ' + p.message).join('\n'));
      deck.scenes[i] = next;
      store.saveDeck(deck);
      return { updated: a.id };
    },
  },
  remove_scene: {
    description: 'Remove a scene and drop it from every route.',
    schema: { type: 'object', properties: { deck: { type: 'string' }, id: { type: 'string' } }, required: ['deck', 'id'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      deck.scenes.splice(requireScene(deck, a.id), 1);
      for (const name of Object.keys(deck.routes)) deck.routes[name] = deck.routes[name].filter(x => x !== a.id);
      store.saveDeck(deck);
      return { removed: a.id, scenes: deck.scenes.length };
    },
  },
  move_scene: {
    description: 'Move a scene to a new index in the master scene list (does not change routes).',
    schema: { type: 'object', properties: { deck: { type: 'string' }, id: { type: 'string' }, position: { type: 'number' } }, required: ['deck', 'id', 'position'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const [scene] = deck.scenes.splice(requireScene(deck, a.id), 1);
      deck.scenes.splice(Math.max(0, Math.min(deck.scenes.length, a.position)), 0, scene);
      store.saveDeck(deck);
      return { moved: a.id, order: deck.scenes.map(s => s.id) };
    },
  },
  set_route: {
    description: 'Define or replace a named run of show: an ordered subset of scene ids. The presenter can switch routes live. Example routes: "performance" (the talk), "short" (10-minute cut), "complete" is always auto-generated.',
    schema: {
      type: 'object',
      properties: {
        deck: { type: 'string' }, name: { type: 'string' },
        sceneIds: { type: 'array', items: { type: 'string' } },
        label: { type: 'string', description: 'Human label for the route dropdown.' },
      },
      required: ['deck', 'name', 'sceneIds'],
    },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const known = new Set(deck.scenes.map(s => s.id));
      const missing = a.sceneIds.filter(id => !known.has(id));
      if (missing.length) throw new Error('Unknown scene ids: ' + missing.join(', '));
      deck.routes[a.name] = a.sceneIds;
      if (a.label) { deck.routeLabels = deck.routeLabels || {}; deck.routeLabels[a.name] = a.label; }
      store.saveDeck(deck);
      return { route: a.name, scenes: a.sceneIds.length };
    },
  },
  set_data: {
    description: 'Attach a named dataset to the deck (deck.data.<key>). Custom scenes receive deck.data merged with their own scene.data — put real observations/quotes/series here instead of hardcoding numbers into scene code.',
    schema: { type: 'object', properties: { deck: { type: 'string' }, key: { type: 'string' }, value: {} }, required: ['deck', 'key', 'value'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      deck.data[a.key] = a.value;
      store.saveDeck(deck);
      return { key: a.key, bytes: JSON.stringify(a.value).length, dataKeys: Object.keys(deck.data) };
    },
  },
  add_asset: {
    description: 'Copy a local file (image, video, artwork) into the deck assets folder. Reference it from scenes as "assets/<name>".',
    schema: { type: 'object', properties: { deck: { type: 'string' }, source: { type: 'string', description: 'Absolute path of the file to copy.' }, name: { type: 'string', description: 'Optional new filename.' } }, required: ['deck', 'source'] },
    run: a => {
      store.loadDeck(a.deck);
      if (!fs.existsSync(a.source)) throw new Error(`Source file not found: ${a.source}`);
      const name = a.name || path.basename(a.source);
      const dest = path.join(store.assetsDir(a.deck), name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(a.source, dest);
      return { asset: 'assets/' + name, bytes: fs.statSync(dest).size };
    },
  },
  validate_deck: {
    description: 'Validate the whole deck: scene specs, route references, custom code parse checks, missing assets.',
    schema: { type: 'object', properties: { deck: { type: 'string' } }, required: ['deck'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const assets = store.assetsDir(a.deck);
      const problems = validateDeck(deck, rel => fs.existsSync(path.join(assets, rel.replace(/^assets\//, ''))));
      return { deck: a.deck, ok: !problems.some(p => p.level === 'error'), problems };
    },
  },
  build_deck: {
    description: 'Compile the deck into a self-contained offline app (dist/index.html + runtime + assets). Open index.html directly or use preview_deck.',
    schema: { type: 'object', properties: { deck: { type: 'string' } }, required: ['deck'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const assets = store.assetsDir(a.deck);
      const problems = validateDeck(deck, rel => fs.existsSync(path.join(assets, rel.replace(/^assets\//, ''))));
      if (problems.some(p => p.level === 'error')) throw new Error('Build blocked by validation errors:\n' + JSON.stringify(problems.filter(p => p.level === 'error'), null, 2));
      const result = buildDeck(deck);
      return { ...result, warnings: problems.filter(p => p.level !== 'error') };
    },
  },
  preview_deck: {
    description: 'Build the deck and serve it on localhost in the background. Returns the URL. Use stop_preview to stop.',
    schema: { type: 'object', properties: { deck: { type: 'string' }, port: { type: 'number' } }, required: ['deck'] },
    run: a => {
      const deck = store.loadDeck(a.deck);
      const built = buildDeck(deck);
      stopPreview(a.deck);
      let hash = 0;
      for (const ch of a.deck) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      const port = a.port || 4620 + (hash % 200);
      const child = spawn(process.execPath, [SERVE_SCRIPT, built.dist, String(port)], { detached: true, stdio: 'ignore' });
      child.unref();
      fs.writeFileSync(path.join(store.deckDir(a.deck), 'preview.json'), JSON.stringify({ pid: child.pid, port }));
      return { url: `http://127.0.0.1:${port}/`, pid: child.pid, dist: built.dist };
    },
  },
  stop_preview: {
    description: 'Stop the background preview server for a deck.',
    schema: { type: 'object', properties: { deck: { type: 'string' } }, required: ['deck'] },
    run: a => ({ stopped: stopPreview(a.deck) }),
  },
};

function stopPreview(deckId) {
  const f = path.join(store.deckDir(deckId), 'preview.json');
  if (!fs.existsSync(f)) return false;
  try {
    const { pid } = JSON.parse(fs.readFileSync(f, 'utf8'));
    process.kill(pid);
    fs.rmSync(f);
    return true;
  } catch { fs.rmSync(f, { force: true }); return false; }
}

/* ---------------- MCP plumbing ---------------- */

const write = msg => process.stdout.write(JSON.stringify(msg) + '\n');

function handle(msg) {
  const { id, method, params } = msg;
  const reply = result => id !== undefined && write({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && write({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      return reply({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'distributed-slides', version: VERSION },
        instructions: 'Distributed-Slides builds animated, presenter-grade slide experiences. Workflow: create_deck -> scene_reference (read it) -> add_scene per scene -> set_route -> validate_deck -> build_deck or preview_deck. Output is a fully offline app with a private presenter view (speaking notes, next-scene preview, transition cues, rehearsal clock) and a synchronized audience window. All animation is a pure function of the presenter clock, so scrubbing, speed and audience sync are exact.',
      });
    }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') {
      return reply({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.description, inputSchema: t.schema })) });
    }
    if (method === 'tools/call') {
      const tool = tools[params.name];
      if (!tool) return fail(-32602, `Unknown tool ${params.name}`);
      try {
        const result = tool.run(params.arguments || {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true });
      }
    }
    if (method && method.startsWith('notifications/')) return;
    if (id !== undefined) fail(-32601, `Method not found: ${method}`);
  } catch (e) {
    fail(-32603, e.message);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const lineText = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!lineText) continue;
    let msg;
    try { msg = JSON.parse(lineText); } catch { continue; }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
