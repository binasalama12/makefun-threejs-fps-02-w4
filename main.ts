// Cinder Foundry — handover program (Node 22, standard library only).
//
// The game itself is the game/ folder next to this file: plain static
// files the browser loads as ES modules, with three.js arriving through
// an import map. This program's whole job is to hand that game in — it
// copies game/ and screenshots/ into the output directory and writes a
// dossier.json there using buildDossier from the vendored make.fun
// library, so the judges read exactly the bytes that were played here.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the playable game and its screenshots across, untouched.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Write the dossier with the same caps the scorer enforces: the dossier
// text is capped, screenshots are limited in count and size, and game/
// must stay inside its file-count and byte budgets.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
