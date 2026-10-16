#!/usr/bin/env node
// harness-upgrade.mjs — Compara un proyecto derivado con la plantilla SSD (ADR 0001, D9).
//
//   node scripts/harness-upgrade.mjs --check [--ref <tag|rama>] [--repo <url|ruta>]
//
// Modelo pull, 0 tokens, SOLO LECTURA. Clona la plantilla (git clone --depth 1 de
// un tag o rama, no un SHA) a un directorio temporal y compara el proyecto (cwd)
// con ella según su harness.manifest.json. Sin --ref usa el último tag vX.Y.Z.
// Salida: 0 sin deriva · 1 deriva en ficheros de plantilla · 2 error de uso,
// descarga o manifiesto. Requiere Node >= 18 y git.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const paint = (code) => (s) => (process.env.NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const ok = (s) => console.log(`${paint('0;32')('[OK]')}    ${s}`);
const warn = (s) => console.log(`${paint('0;33')('[WARN]')}  ${s}`);
const fail = (s) => console.log(`${paint('0;31')('[FAIL]')}  ${s}`);

const USAGE = 'Uso: node scripts/harness-upgrade.mjs --check [--ref <tag|rama>] [--repo <url|ruta>]';
const DEFAULT_REPO = 'https://github.com/Cenit-Digital/TemplateSSDUncleBob.git';
const ROOT = process.cwd();
const die = (msg) => { throw new Error(msg); };

/** BOM inicial y CRLF fuera: .gitattributes fuerza CRLF en *.ps1 y LF en el resto. */
const norm = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s).replace(/\r\n/g, '\n');
const read = (p) => norm(fs.readFileSync(p, 'utf8'));
const safe = (p) => typeof p === 'string' && p !== '' && !p.includes('\\')
  && !path.posix.isAbsolute(p) && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..');
const covers = (entry, file) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry);

/** Ejecuta git sin prompts. Con `soft` devuelve null si falla; si no, aborta (salida 2). */
function git(args, cwd, soft = false) {
  const r = spawnSync('git', args, {
    cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' },
  });
  if (r.status === 0) return r.stdout;
  if (soft) return null;
  return die(`git ${args[0]} falló: ${(r.error?.message ?? r.stderr).trim().split('\n').pop()}`);
}

function parseArgs(argv) {
  const o = { check: false, ref: null, repo: DEFAULT_REPO };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') o.check = true;
    else if (argv[i] === '--ref' || argv[i] === '--repo') {
      const flag = argv[i];
      const v = argv[++i];
      if (!v || v.startsWith('--')) die(`${flag} necesita un valor. ${USAGE}`);
      o[flag.slice(2)] = v;
    } else die(`Argumento desconocido: ${argv[i]}. ${USAGE}`);
  }
  if (!o.check) die(`Falta --check (por ahora el único modo). ${USAGE}`);
  if (fs.existsSync(o.repo)) o.repo = pathToFileURL(path.resolve(o.repo)).href;
  return o;
}

/** Último tag vX.Y.Z del repo remoto (orden de versión de git, no léxico). */
function latestTag(repo) {
  const tags = git(['ls-remote', '--tags', '--refs', '--sort=-v:refname', repo]).split('\n')
    .map((l) => l.split('refs/tags/')[1]).filter((t) => /^v\d+\.\d+\.\d+$/.test(t ?? ''));
  return tags[0] ?? die('La plantilla no tiene tags vX.Y.Z; indica una rama con --ref (p. ej. --ref main).');
}

/** Lee y valida el manifiesto de la plantilla descargada (sus rutas son datos no fiables). */
function loadManifest(dir, files) {
  let m;
  try { m = JSON.parse(read(path.join(dir, 'harness.manifest.json'))); } catch (e) {
    die(`La plantilla no trae un harness.manifest.json válido (${e.code ?? e.message}).`);
  }
  for (const k of ['template', 'executable', 'mixedBlock', 'mixedJson']) {
    if (!Array.isArray(m?.[k]) || !m[k].every(safe)) die(`harness.manifest.json: "${k}" debe ser una lista de rutas relativas seguras.`);
  }
  for (const e of [...m.template, ...m.mixedBlock, ...m.mixedJson]) {
    if (!files.some((f) => covers(e, f))) die(`El manifiesto lista "${e}", que no existe en la plantilla.`);
  }
  return m;
}

/** true/false según el bit ejecutable del derivado; null si no se puede saber (Windows sin git). */
function isExecutable(rel) {
  const mode = git(['ls-files', '-s', '--', rel], ROOT, true)?.trim().split(/\s+/)[0];
  if (mode) return mode === '100755';
  return process.platform === 'win32' ? null : (fs.statSync(path.join(ROOT, rel)).mode & 0o111) !== 0;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ref = opts.ref ?? latestTag(opts.repo);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-upgrade-'));
  try {
    git(['-c', 'advice.detachedHead=false', 'clone', '--depth', '1', '--quiet', '--branch', ref, opts.repo, tmp]);
    const files = git(['ls-files', '-z'], tmp).split('\0').filter(Boolean);
    const m = loadManifest(tmp, files);
    ok(`plantilla ${ref} (${git(['rev-parse', '--short', 'HEAD'], tmp).trim()}) de ${opts.repo}`);

    const owned = files.filter((f) => m.template.some((e) => covers(e, f)));
    let drift = 0;
    for (const f of owned) {
      const mine = path.join(ROOT, f);
      if (!fs.existsSync(mine)) { fail(`falta: ${f}`); drift++; continue; }
      if (read(mine) !== read(path.join(tmp, f))) { fail(`difiere: ${f}`); drift++; }
      if (m.executable.includes(f) && isExecutable(f) === false) { fail(`sin bit ejecutable: ${f} (git update-index --chmod=+x)`); drift++; }
    }
    if (drift === 0) ok(`${owned.length} ficheros de plantilla sin deriva.`);

    for (const f of m.mixedBlock) warn(`${f}: bloque gestionado sin comprobar (llega con --apply).`);
    for (const f of m.mixedJson) {
      const mine = path.join(ROOT, f);
      if (!fs.existsSync(mine)) warn(`${f}: falta (JSON mixto; el reemplazo es explícito).`);
      else if (read(mine) !== read(path.join(tmp, f))) warn(`${f}: difiere de la plantilla (JSON mixto; revísalo, el reemplazo es explícito).`);
      else ok(`${f}: igual que la plantilla.`);
    }
    if (drift > 0) fail(`Deriva en ${drift} comprobación(es) de ficheros de plantilla.`);
    process.exitCode = drift > 0 ? 1 : 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try { main(); } catch (e) { fail(e.message); process.exitCode = 2; }
