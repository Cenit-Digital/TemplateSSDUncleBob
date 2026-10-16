// upgrade.test.mjs — Tests de scripts/harness-upgrade.mjs (--check) y de harness.manifest.json.
//
// El script es un CLI: cada caso lo lanza como subproceso contra una plantilla de
// juguete (repo git temporal, aislado de la config git del usuario y de la CI) y
// comprueba el código de salida y la salida. Se corre con ruta explícita:
//
//   node --test .harness/test/upgrade.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'harness-upgrade.mjs');
const dirs = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-upg-')); dirs.push(d); return d; };

const CFG = path.join(tmp(), 'gitconfig'); // vacío: ni identidad, ni autocrlf, ni firma del usuario
fs.writeFileSync(CFG, '');
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: CFG, GIT_CONFIG_NOSYSTEM: '1', NO_COLOR: '1' };
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, env: ENV, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

const MANIFEST = { version: 1, template: ['a.txt', 'dir/', 'run.sh'], executable: ['run.sh'], mixedBlock: ['AGENTS.md'], mixedJson: ['cfg.json'], project: ['proj.txt'], excluded: [] };
const FILES = { 'a.txt': 'uno\n', 'dir/b.txt': 'dos\n', 'run.sh': '#!/bin/sh\n', 'AGENTS.md': 'x\n', 'cfg.json': '{"k":1}\n', 'proj.txt': 'p\n' };

/** Repo git con FILES + `files` (null borra). `tags` => commit + tags; `exec` fija el bit de run.sh. */
function repo(files, { exec = true, manifest, tags } = {}) {
  const d = tmp();
  const all = { ...FILES, ...files, ...(manifest ? { 'harness.manifest.json': JSON.stringify(manifest) } : {}) };
  for (const [f, body] of Object.entries(all)) {
    if (body === null) continue;
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), body);
  }
  git(d, 'init', '-q', '-b', 'main');
  git(d, 'add', '-A');
  if (exec && all['run.sh'] !== null) git(d, 'update-index', '--chmod=+x', 'run.sh');
  if (tags) { git(d, 'commit', '-q', '-m', 't'); tags.forEach((t) => git(d, 'tag', t)); }
  return d;
}
const tpl = (patch = {}, tags = ['v1.0.0']) => repo({}, { manifest: { ...MANIFEST, ...patch }, tags });
const run = (template, project, ...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, '--check', '--repo', template, ...args], { cwd: project, env: ENV, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};

const BASE = tpl();
// [nombre, ficheros del proyecto, opciones del proyecto, plantilla, código de salida, salida esperada]
const CASES = [
  ['idéntico', {}, {}, BASE, 0, /sin deriva/],
  ['solo cambian BOM y CRLF', { 'a.txt': String.fromCharCode(0xfeff) + 'uno\r\n' }, {}, BASE, 0, /sin deriva/],
  ['fichero extra en un directorio de plantilla', { 'dir/extra.txt': 'x' }, {}, BASE, 0, /sin deriva/],
  ['fichero de proyecto distinto', { 'proj.txt': 'mío' }, {}, BASE, 0, /sin deriva/],
  ['JSON mixto distinto: solo WARN', { 'cfg.json': '{"k":2}\n' }, {}, BASE, 0, /\[WARN\]\s+cfg\.json: difiere/],
  ['fichero de plantilla distinto', { 'a.txt': 'otro\n' }, {}, BASE, 1, /\[FAIL\]\s+difiere: a\.txt/],
  ['fichero de un directorio de plantilla distinto', { 'dir/b.txt': 'x\n' }, {}, BASE, 1, /difiere: dir\/b\.txt/],
  ['falta un fichero de plantilla', { 'a.txt': null }, {}, BASE, 1, /falta: a\.txt/],
  ['sin bit ejecutable', {}, { exec: false }, BASE, 1, /sin bit ejecutable: run\.sh/],
  ['manifiesto con ruta insegura', {}, {}, tpl({ template: ['../fuera'] }), 2, /rutas relativas seguras/],
  ['manifiesto con entrada inexistente', {}, {}, tpl({ template: ['nada.txt'] }), 2, /no existe en la plantilla/],
];
for (const [name, files, opts, template, code, re] of CASES) {
  test(name, () => {
    const r = run(template, repo(files, opts));
    assert.equal(r.code, code, r.out);
    assert.match(r.out, re);
  });
}

test('sin --ref usa el último tag vX.Y.Z (orden de versión; ignora otros)', () => {
  const r = run(tpl({}, ['v1.0.0', 'v1.2.0', 'v1.10.0', 'v2.0.0-rc1', 'nightly']), repo({}));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /v1\.10\.0 /);
});

test('sin tags falla legible y con --ref <rama> funciona', () => {
  const t = tpl({}, []);
  assert.match(run(t, repo({})).out, /no tiene tags/);
  assert.equal(run(t, repo({})).code, 2);
  assert.equal(run(t, repo({}), '--ref', 'main').code, 0);
});

test('--ref fija la versión: el tag no ve los cambios posteriores de la rama', () => {
  const t = tpl();
  fs.writeFileSync(path.join(t, 'a.txt'), 'posterior\n');
  git(t, 'commit', '-aqm', 'b');
  assert.equal(run(t, repo({}), '--ref', 'v1.0.0').code, 0);
  assert.equal(run(t, repo({}), '--ref', 'main').code, 1);
});

test('el manifiesto real clasifica cada fichero rastreado en exactamente una categoría', () => {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'harness.manifest.json'), 'utf8'));
  const cats = ['template', 'mixedBlock', 'mixedJson', 'project', 'excluded'];
  const covers = (e, f) => (e.endsWith('/') ? f.startsWith(e) : f === e);
  const files = Object.fromEntries(git(REPO, 'ls-files', '-s', '-z').split('\0').filter(Boolean)
    .map((rec) => rec.split('\t').reverse()).map(([f, info]) => [f, info.split(' ')[0]]));
  for (const f of Object.keys(files)) {
    const hit = cats.filter((c) => m[c].some((e) => covers(e, f)));
    assert.equal(hit.length, 1, `${f}: en ${hit.length} categorías (${hit})`);
  }
  for (const e of cats.flatMap((c) => m[c])) assert.ok(Object.keys(files).some((f) => covers(e, f)), `entrada sin ficheros: ${e}`);
  for (const x of m.executable) {
    assert.ok(m.template.includes(x), `${x} no está en template`);
    assert.equal(files[x], '100755', `${x} perdió el bit ejecutable`);
  }
});
