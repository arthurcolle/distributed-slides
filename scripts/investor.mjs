// Build and preview the source-backed Distributed Systems investor example.
import {spawn} from 'node:child_process';
import {buildDeck} from '../src/build.mjs';
import {loadDeck} from '../src/store.mjs';
const built=buildDeck(loadDeck('distributed-investor'));
const port=process.env.PORT || '4621';
console.log(`Built ${built.scenes} scenes. Presenter: http://127.0.0.1:${port}/`);
console.log(`Audience: http://127.0.0.1:${port}/?audience=1`);
spawn(process.execPath,['src/serve.mjs',built.dist,port],{stdio:'inherit'});
