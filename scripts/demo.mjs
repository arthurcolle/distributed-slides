// Build and serve the bundled weather-trading example deck.
// Usage: npm run demo   →  http://127.0.0.1:4620/
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDeck } from '../src/store.mjs';
import { buildDeck } from '../src/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = buildDeck(loadDeck('demo-flagship'));
console.log(`Built ${built.scenes} scenes → ${built.dist}`);
const port = process.env.PORT || 4620;
spawn(process.execPath, [path.join(ROOT, 'src/serve.mjs'), built.dist, String(port)], { stdio: 'inherit' });
console.log(`\n  Presenter view:  http://127.0.0.1:${port}/`);
console.log(`  Press P inside the app to open the synchronized audience window.\n`);
