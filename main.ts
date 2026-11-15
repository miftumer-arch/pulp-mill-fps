// Pulp Mill — a 5v5 round-based tactical FPS (three.js 0.187.0, Node 22, standard library only).
// The game itself is this directory's game/ folder: plain static files the browser loads as ES
// modules through a three.js import map. This entrypoint hands the program in: it copies game/
// and screenshots/ from beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, using the vendored make.fun library. The map is an old paper mill — a pulp
// hall, a drying yard, and a press machine splitting Mid — with plant/defuse rounds, a buy
// economy, and team bots on both sides. Put fresh PNG or JPEG screenshots in screenshots/ (the
// first by name is the cover) and run it.
//
// Run it locally with `node serve.ts`, then open http://localhost:8080 in a browser.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output, so:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   (the dossier lands in out/dossier.json)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Dossier caps, mirroring the scorer's gate (reference/gate.json): text_max_bytes shapes the
// dossier text; the other caps refuse an entry the scorer would refuse — at most 4 screenshots,
// each at most 256 KiB; at most 993 files or 48 MiB under game/ in total (game/ counts beside
// /output's own 1000-entry cap, its screenshots/ folder, and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
