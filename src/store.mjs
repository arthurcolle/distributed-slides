import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DECKS_ROOT = process.env.DISTRIBUTED_SLIDES_HOME || path.join(PKG_ROOT, 'decks');
export const RUNTIME_DIR = path.join(PKG_ROOT, 'runtime');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function assertId(id, label = 'deck id') {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new Error(`Invalid ${label} "${id}". Use lowercase letters, digits and hyphens.`);
  }
  return id;
}

export const deckDir = id => path.join(DECKS_ROOT, assertId(id));
export const deckFile = id => path.join(deckDir(id), 'deck.json');
export const assetsDir = id => path.join(deckDir(id), 'assets');
export const distDir = id => path.join(deckDir(id), 'dist');

export function listDecks() {
  if (!fs.existsSync(DECKS_ROOT)) return [];
  return fs.readdirSync(DECKS_ROOT)
    .filter(name => fs.existsSync(path.join(DECKS_ROOT, name, 'deck.json')))
    .map(name => {
      const deck = loadDeck(name);
      return {
        id: deck.id,
        title: deck.title,
        scenes: deck.scenes.length,
        routes: Object.keys(deck.routes),
        updatedAt: deck.updatedAt,
      };
    });
}

export function deckExists(id) {
  return fs.existsSync(deckFile(id));
}

export function loadDeck(id) {
  if (!deckExists(id)) throw new Error(`Deck "${id}" does not exist. Use create_deck first.`);
  return JSON.parse(fs.readFileSync(deckFile(id), 'utf8'));
}

export function saveDeck(deck) {
  deck.updatedAt = new Date().toISOString();
  fs.mkdirSync(deckDir(deck.id), { recursive: true });
  fs.mkdirSync(assetsDir(deck.id), { recursive: true });
  fs.writeFileSync(deckFile(deck.id), JSON.stringify(deck, null, 2));
  return deck;
}

export function deleteDeck(id) {
  if (!deckExists(id)) throw new Error(`Deck "${id}" does not exist.`);
  fs.rmSync(deckDir(id), { recursive: true, force: true });
}

export function newDeck(input) {
  assertId(input.id);
  if (deckExists(input.id)) throw new Error(`Deck "${input.id}" already exists.`);
  return saveDeck({
    id: input.id,
    title: input.title,
    subtitle: input.subtitle || '',
    brand: input.brand || 'DISTRIBUTED SYSTEMS',
    brandTag: input.brandTag || 'A LIVE PERFORMANCE',
    badge: input.badge || '',
    footer: input.footer || '',
    defaultRoute: input.defaultRoute || 'performance',
    rehearsalCueSeconds: input.rehearsalCueSeconds || 0,
    theme: input.theme || {},
    createdAt: new Date().toISOString(),
    scenes: [],
    routes: {},
    routeLabels: {},
    data: {},
  });
}
