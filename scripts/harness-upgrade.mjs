#!/usr/bin/env node
// harness-upgrade.mjs — Compara y actualiza un proyecto derivado con la plantilla SSD (ADR 0001, D9).
//
//   node scripts/harness-upgrade.mjs --check | --diff | --apply [--yes] [--replace-json <ruta>]...
//                                    [--ref <tag|rama>] [--repo <url|ruta>]
//
// Modelo pull, 0 tokens. Clona la plantilla (git clone --depth 1 de un tag o rama,
// no un SHA) a un directorio temporal y compara el proyecto (cwd) con ella según su
// harness.manifest.json. Sin --ref usa el último tag vX.Y.Z.
//   --check  SOLO LECTURA: lista la deriva.
//   --diff   SOLO LECTURA: lo mismo, y muestra el diff de cada fichero que difiere.
//   --apply  reemplaza los ficheros `template` que difieren, tras mostrar el diff y pedir
//            confirmación (--yes la omite). Nunca borra ni toca `project`. Un JSON mixto
//            solo se reemplaza si se nombra con --replace-json. Rechaza enlaces simbólicos
//            de la plantilla y ediciones sin confirmar en lo que pisaría. Lo aplicado queda
//            añadido al índice (git add), con el bit ejecutable fijado.
// Salida: 0 sin deriva (o aplicado) · 1 deriva en ficheros de plantilla (o aplicación
// rechazada) · 2 error de uso, descarga, manifiesto o guarda. Requiere Node >= 18 y git.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const paint = (code) => (s) => (process.env.NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const ok = (s) => console.log(`${paint('0;32')('[OK]')}    ${s}`);
const warn = (s) => console.log(`${paint('0;33')('[WARN]')}  ${s}`);
const fail = (s) => console.log(`${paint('0;31')('[FAIL]')}  ${s}`);

const USAGE = 'Uso: node scripts/harness-upgrade.mjs --check | --diff | --apply [--yes] [--replace-json <ruta>]... [--ref <tag|rama>] [--repo <url|ruta>]';
const DEFAULT_REPO = 'https://github.com/Cenit-Digital/TemplateSSDUncleBob.git';
const MODES = ['--check', '--diff', '--apply'];
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

/** Una línea de stdin (TTY o pipe); '' si se cierra sin respuesta. */
const ask = (question) => new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.once('close', () => resolve(''));
  rl.question(question, (answer) => { resolve(answer); rl.close(); });
});

function parseArgs(argv) {
  const o = { mode: null, yes: false, json: [], ref: null, repo: DEFAULT_REPO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (MODES.includes(a)) {
      if (o.mode) die(`Usa un solo modo (${o.mode} y ${a}). ${USAGE}`);
      o.mode = a;
    } else if (a === '--yes') o.yes = true;
    else if (a === '--ref' || a === '--repo' || a === '--replace-json') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) die(`${a} necesita un valor. ${USAGE}`);
      if (a === '--replace-json') o.json.push(v);
      else o[a.slice(2)] = v;
    } else die(`Argumento desconocido: ${a}. ${USAGE}`);
  }
  if (!o.mode) die(`Falta el modo. ${USAGE}`);
  if ((o.yes || o.json.length) && o.mode !== '--apply') die(`--yes y --replace-json solo valen con --apply. ${USAGE}`);
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
  for (const k of ['template', 'executable', 'mixedBlock', 'mixedJson', 'project', 'excluded']) {
    if (!Array.isArray(m?.[k]) || !m[k].every(safe)) die(`harness.manifest.json: "${k}" debe ser una lista de rutas relativas seguras.`);
  }
  for (const e of [...m.template, ...m.mixedBlock, ...m.mixedJson]) {
    if (!files.some((f) => covers(e, f))) die(`El manifiesto lista "${e}", que no existe en la plantilla.`);
  }
  for (const e of [...m.template, ...m.executable, ...m.mixedBlock, ...m.mixedJson]) {
    const x = [...m.project, ...m.excluded].find((p) => covers(e, p) || covers(p, e));
    if (x) die(`El manifiesto pone "${e}" como de la plantilla y "${x}" como del proyecto o excluido, y se solapan.`);
  }
  return m;
}

/** true/false según el bit ejecutable del derivado; null si no se puede saber (Windows sin git). */
function isExecutable(rel) {
  const mode = git(['ls-files', '-s', '--', rel], ROOT, true)?.trim().split(/\s+/)[0];
  if (mode) return mode === '100755';
  return process.platform === 'win32' ? null : (fs.statSync(path.join(ROOT, rel)).mode & 0o111) !== 0;
}

/** Diff de `rel` (proyecto → plantilla) con git; las copias old/ y new/ dan cabeceras legibles. */
function showDiff(tmp, rel) {
  const stage = path.join(tmp, '.stage');
  for (const [side, src] of [['old', path.join(ROOT, rel)], ['new', path.join(tmp, rel)]]) {
    const dst = path.join(stage, side, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    else fs.writeFileSync(dst, '');
  }
  spawnSync('git', ['--no-pager', 'diff', '--no-index', '--no-ext-diff', '--no-color', '--ignore-cr-at-eol', '--', `old/${rel}`, `new/${rel}`], { cwd: stage, stdio: 'inherit' });
}

/** Valida todo antes de escribir, pide confirmación, copia y añade al índice. Devuelve la salida. */
async function applyChanges(tmp, m, todo, yes) {
  const rels = [...todo.keys()];
  if (rels.length === 0) { ok('Nada que aplicar.'); return 0; }
  const dirty = git(['status', '--porcelain', '--', ...rels], ROOT, true);
  if (dirty === null) warn('El proyecto no es un repo git: no puedo comprobar si hay cambios sin confirmar.');
  else if (dirty.trim()) die(`Hay cambios sin confirmar en ficheros que se reemplazarían; confírmalos o descártalos antes:\n${dirty.trimEnd()}`);
  if (!yes && !/^(s|sí|si|y|yes)$/i.test((await ask(`¿Aplicar ${rels.length} cambio(s)? [s/N] `)).trim())) {
    warn('No se ha escrito nada.');
    return 1;
  }
  for (const [f, content] of todo) {
    if (!content) continue;
    fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
    fs.copyFileSync(path.join(tmp, f), path.join(ROOT, f));
  }
  ok(`${rels.length} cambio(s) aplicado(s).`);
  if (dirty === null || git(['add', '--', ...rels], ROOT, true) === null) {
    warn('Sin git: añade lo aplicado a mano y fija el bit ejecutable (chmod +x) donde haga falta.');
    return 0;
  }
  for (const f of rels.filter((r) => m.executable.includes(r))) git(['update-index', '--chmod=+x', '--', f], ROOT, true);
  ok('Añadido al índice (git add) con el bit ejecutable fijado; revisa con `git diff --cached` y confirma.');
  return 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ref = opts.ref ?? latestTag(opts.repo);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-upgrade-'));
  try {
    git(['-c', 'advice.detachedHead=false', 'clone', '--depth', '1', '--quiet', '--branch', ref, opts.repo, tmp]);
    const modes = new Map(git(['ls-files', '-s', '-z'], tmp).split('\0').filter(Boolean)
      .map((r) => [r.slice(r.indexOf('\t') + 1), r.split(' ')[0]]));
    const files = [...modes.keys()];
    const m = loadManifest(tmp, files);
    ok(`plantilla ${ref} (${git(['rev-parse', '--short', 'HEAD'], tmp).trim()}) de ${opts.repo}`);
    for (const f of opts.json) if (!m.mixedJson.includes(f)) die(`--replace-json ${f}: no es un JSON mixto del manifiesto.`);

    const owned = files.filter((f) => m.template.some((e) => covers(e, f)));
    const links = [...owned, ...m.mixedJson].filter((f) => modes.get(f) === '120000');
    if (links.length > 0) die(`La plantilla trae enlaces simbólicos entre lo que se propaga (no se reemplazan): ${links.join(', ')}`);
    const todo = new Map(); // ruta → true si hay que copiar su contenido, false si solo el bit ejecutable
    const differs = []; // rutas cuyo contenido difiere (las que enseña --diff)
    let drift = 0;
    for (const f of owned) {
      const mine = path.join(ROOT, f);
      if (!fs.existsSync(mine)) { fail(`falta: ${f}`); drift++; todo.set(f, true); differs.push(f); continue; }
      if (read(mine) !== read(path.join(tmp, f))) { fail(`difiere: ${f}`); drift++; todo.set(f, true); differs.push(f); }
      if (m.executable.includes(f) && isExecutable(f) === false) { fail(`sin bit ejecutable: ${f} (git update-index --chmod=+x)`); drift++; todo.set(f, todo.get(f) ?? false); }
    }
    if (drift === 0) ok(`${owned.length} ficheros de plantilla sin deriva.`);

    for (const f of m.mixedBlock) warn(`${f}: bloque gestionado sin comprobar (aún no soportado).`);
    for (const f of m.mixedJson) {
      const gone = !fs.existsSync(path.join(ROOT, f));
      if (!gone && read(path.join(ROOT, f)) === read(path.join(tmp, f))) { ok(`${f}: igual que la plantilla.`); continue; }
      differs.push(f);
      if (opts.json.includes(f)) { todo.set(f, true); warn(`${f}: se reemplazará (--replace-json).`); }
      else warn(`${f}: ${gone ? 'falta' : 'difiere de la plantilla'} (JSON mixto; revísalo, el reemplazo es explícito: --apply --replace-json ${f}).`);
    }
    if (opts.mode !== '--check') for (const f of differs) if (opts.mode === '--diff' || todo.has(f)) showDiff(tmp, f);
    if (drift > 0 && opts.mode !== '--apply') fail(`Deriva en ${drift} comprobación(es) de ficheros de plantilla.`);
    process.exitCode = opts.mode === '--apply' ? await applyChanges(tmp, m, todo, opts.yes) : Number(drift > 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { fail(e.message); process.exitCode = 2; });
