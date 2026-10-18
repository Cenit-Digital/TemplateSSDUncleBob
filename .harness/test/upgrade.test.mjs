// upgrade.test.mjs — Tests de scripts/harness-upgrade.mjs (--check, --diff, --apply) y de harness.manifest.json.
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

const BLOCK = '<!-- harness:begin -->\n## Arnés\n- uno\n<!-- harness:end -->\n';
const MANIFEST = { version: 1, template: ['a.txt', 'dir/', 'run.sh'], executable: ['run.sh'], mixedBlock: ['AGENTS.md'], blockSource: 'blk.md', mixedJson: ['cfg.json'], project: ['proj.txt'], excluded: ['blk.md'] };
const FILES = { 'a.txt': 'uno\n', 'dir/b.txt': 'dos\n', 'run.sh': '#!/bin/sh\n', 'AGENTS.md': `# a\n\n${BLOCK}`, 'blk.md': BLOCK, 'cfg.json': '{"k":1}\n', 'proj.txt': 'p\n' };

/** Repo git con FILES + `files` (null borra). `tags` => commit + tags; `exec` fija el bit de run.sh; `link` añade ese enlace simbólico (-> b.txt) al índice. */
function repo(files, { exec = true, manifest, tags, link } = {}) {
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
  if (link) { // un enlace real en el índice, sin necesitar permisos de symlink (también vale en Windows)
    const target = path.join(tmp(), 'target');
    fs.writeFileSync(target, 'b.txt');
    git(d, 'update-index', '--add', '--cacheinfo', `120000,${git(d, 'hash-object', '-w', target).trim()},${link}`);
  }
  if (tags) { git(d, 'commit', '-q', '-m', 't'); tags.forEach((t) => git(d, 'tag', t)); }
  return d;
}
const tpl = (patch = {}, tags = ['v1.0.0']) => repo({}, { manifest: { ...MANIFEST, ...patch }, tags });
const proj = (files, opts) => repo(files, { tags: [], ...opts }); // proyecto con línea base confirmada
const exec = (template, project, args, input = '') => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--repo', template], { cwd: project, env: ENV, encoding: 'utf8', input });
  return { code: r.status, out: r.stdout + r.stderr };
};
const run = (template, project, ...args) => exec(template, project, ['--check', ...args]);

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
  ['manifiesto que solapa plantilla y proyecto', {}, {}, tpl({ project: ['dir/b.txt'] }), 2, /"dir\/".*"dir\/b\.txt".*se solapan/],
  ['manifiesto que solapa plantilla y excluido', {}, {}, tpl({ excluded: ['a.txt'] }), 2, /"a\.txt".*se solapan/],
  ['manifiesto con un proyecto que contiene algo de plantilla', {}, {}, tpl({ template: ['dir/b.txt'], project: ['dir/'] }), 2, /se solapan/],
  ['manifiesto con mixedBlock sin blockSource', {}, {}, tpl({ blockSource: undefined }), 2, /blockSource/],
  ['blockSource con texto fuera del bloque', {}, {}, repo({ 'blk.md': `fuera\n${BLOCK}` }, { manifest: MANIFEST, tags: ['v1.0.0'] }), 2, /único bloque/],
  ['blockSource que es un enlace simbólico de la plantilla', {}, {}, repo({}, { manifest: MANIFEST, tags: ['v1.0.0'], link: 'blk.md' }), 2, /enlaces simbólicos.*blk\.md/],
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

const APPLY = ['--apply', '--yes'];
const rd = (p, f) => fs.readFileSync(path.join(p, f), 'utf8');

test('--diff enseña el diff y no escribe nada', () => {
  const p = proj({ 'a.txt': 'otro\n', 'cfg.json': '{"k":2}\n', 'dir/b.txt': 'dos\r\nmas\r\n' });
  const r = exec(BASE, p, ['--diff']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /old\/a\.txt[\s\S]*-otro\r?\n\+uno/);
  assert.match(r.out, /old\/cfg\.json/); // el JSON mixto con deriva también se enseña, aunque no se reemplace
  assert.match(r.out, /^-mas/m);
  assert.doesNotMatch(r.out, /^-dos/m); // CRLF vs LF no es un cambio de línea (coherente con la comparación)
  assert.deepEqual([rd(p, 'a.txt'), rd(p, 'cfg.json')], ['otro\n', '{"k":2}\n']);
});

test('--apply solo reemplaza lo de plantilla y lo deja en el índice', () => {
  const p = proj({ 'a.txt': 'otro\n', 'dir/b.txt': null, 'dir/extra.txt': 'x', 'proj.txt': 'mío', 'cfg.json': '{"k":2}\n' });
  const r = exec(BASE, p, APPLY);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([rd(p, 'a.txt'), rd(p, 'dir/b.txt')], ['uno\n', 'dos\n']); // difería / faltaba
  assert.deepEqual([rd(p, 'dir/extra.txt'), rd(p, 'proj.txt'), rd(p, 'cfg.json')], ['x', 'mío', '{"k":2}\n']);
  assert.equal(git(p, 'diff', '--name-only', '--', 'a.txt', 'dir/b.txt'), ''); // lo aplicado está añadido al índice (run.sh no: en Linux el fixture lo deja 755 en el índice y 644 en disco)
  assert.equal(run(BASE, p).code, 0);
  assert.match(exec(BASE, p, APPLY).out, /Nada que aplicar/); // idempotente
});

test('--apply fija el bit ejecutable en el índice (con el contenido igual o distinto)', () => {
  for (const files of [{}, { 'run.sh': '#!/bin/sh\necho x\n' }]) {
    const p = proj(files, { exec: false });
    assert.equal(run(BASE, p).code, 1);
    assert.equal(exec(BASE, p, APPLY).code, 0);
    assert.match(git(p, 'ls-files', '-s', 'run.sh'), /^100755 /);
    assert.equal(rd(p, 'run.sh'), '#!/bin/sh\n');
    assert.equal(run(BASE, p).code, 0);
  }
});

test('--apply pide confirmación: n y sin respuesta no escriben, s aplica', () => {
  for (const input of ['n\n', '']) {
    const p = proj({ 'a.txt': 'otro\n' });
    const r = exec(BASE, p, ['--apply'], input);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /Aplicar 1 cambio/);
    assert.equal(rd(p, 'a.txt'), 'otro\n');
  }
  const p = proj({ 'a.txt': 'otro\n' });
  assert.equal(exec(BASE, p, ['--apply'], 's\n').code, 0);
  assert.equal(rd(p, 'a.txt'), 'uno\n');
});

test('--replace-json reemplaza solo el JSON nombrado y rechaza uno que no es mixto', () => {
  const p = proj({ 'cfg.json': '{"k":2}\n' });
  assert.equal(exec(BASE, p, [...APPLY, '--replace-json', 'cfg.json']).code, 0);
  assert.equal(rd(p, 'cfg.json'), '{"k":1}\n');
  const q = proj({ 'a.txt': 'otro\n' });
  const r = exec(BASE, q, [...APPLY, '--replace-json', 'a.txt']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no es un JSON mixto/);
  assert.equal(rd(q, 'a.txt'), 'otro\n');
});

test('--apply rechaza enlaces simbólicos de la plantilla sin escribir nada', () => {
  const t = repo({}, { manifest: MANIFEST, tags: ['v1.0.0'], link: 'dir/link' });
  const p = proj({ 'a.txt': 'otro\n' });
  const r = exec(t, p, APPLY);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /enlaces simbólicos.*dir\/link/);
  assert.equal(rd(p, 'a.txt'), 'otro\n');
});

test('--apply no pisa ediciones sin confirmar', () => {
  const p = proj({});
  fs.writeFileSync(path.join(p, 'a.txt'), 'local\n');
  const r = exec(BASE, p, APPLY);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /sin confirmar[\s\S]*a\.txt/);
  assert.equal(rd(p, 'a.txt'), 'local\n');
});

test('argumentos: un solo modo; --yes y --replace-json solo con --apply', () => {
  for (const args of [[], ['--check', '--diff'], ['--check', '--yes'], ['--diff', '--replace-json', 'cfg.json']]) {
    assert.equal(exec(BASE, proj({}), args).code, 2, args.join(' '));
  }
});

const STALE = BLOCK.replace('uno', 'otro');
const FENCED = `\`\`\`md\n${BLOCK}\`\`\`\n`;
const CRLF = (s) => s.replace(/\n/g, '\r\n');
// [nombre, AGENTS.md del proyecto, salida de --check, salida esperada]
const BLOCK_CASES = [
  ['bloque al día entre texto', `antes\n\n${BLOCK}\ndespués\n`, 0, /bloque gestionado al día/],
  ['bloque al día con BOM y CRLF', `\uFEFF${CRLF(`antes\n${BLOCK}`)}`, 0, /al día/],
  ['sin marcadores', 'solo texto\n', 1, /sin bloque gestionado/],
  ['bloque distinto', `antes\n${STALE}`, 1, /bloque gestionado difiere/],
  ['marcadores solo dentro de una valla ```', FENCED, 1, /sin bloque gestionado/],
  ['marcadores dentro de una valla ```` que contiene ```', `\`\`\`\`\n\`\`\`\n${BLOCK}\`\`\`\`\n`, 1, /sin bloque gestionado/],
  ['marcadores dentro de una valla ~~~ que contiene ```', `~~~\n\`\`\`\n${BLOCK}~~~\n`, 1, /sin bloque gestionado/],
  ['una línea ```js dentro de una valla no la cierra', `\`\`\`\n\`\`\`js\n${BLOCK}\`\`\`\n`, 1, /sin bloque gestionado/],
  ['una línea con ``` que no abre valla', `\`\`\`x\`\`\` texto\n${BLOCK}`, 0, /al día/],
  ['``` sangrado 4 espacios no abre valla', `    \`\`\`\n${BLOCK}`, 0, /al día/],
  ['BOM y bloque en la primera línea', `\uFEFF${BLOCK}`, 0, /al día/],
  ['marcadores sangrados 4 espacios (código)', `${BLOCK.trimEnd().replace(/^/gm, '    ')}\n`, 1, /sin bloque gestionado/],
  ['bloque real y otro de ejemplo en una valla', FENCED + BLOCK, 0, /al día/],
  ['dos bloques', BLOCK + BLOCK, 1, /duplicados o desbalanceados/],
  ['solo begin', '<!-- harness:begin -->\n', 1, /desbalanceados/],
  ['solo end', '<!-- harness:end -->\n', 1, /desbalanceados/],
  ['end antes de begin', '<!-- harness:end -->\n<!-- harness:begin -->\n', 1, /\(1 begin, 1 end\) o en orden inverso/], // el recuento prueba que lo atrapa la comprobación de orden, no la postcondición
  ['dos begin y un end', `<!-- harness:begin -->\n${BLOCK}`, 1, /2 begin, 1 end/],
  ['un begin y dos end', `${BLOCK}<!-- harness:end -->\n`, 1, /1 begin, 2 end/],
];
for (const [name, text, code, re] of BLOCK_CASES) {
  test(`AGENTS.md: ${name}`, () => {
    const r = run(BASE, proj({ 'AGENTS.md': text }));
    assert.equal(r.code, code, r.out);
    assert.match(r.out, re);
  });
}

test('AGENTS.md: --apply reemplaza el bloque y conserva BOM, CRLF y el resto byte a byte', () => {
  const p = proj({ 'AGENTS.md': `\uFEFF${CRLF(`antes\n\n${STALE}\ndespués\n`)}` });
  assert.equal(exec(BASE, p, APPLY).code, 0);
  assert.equal(rd(p, 'AGENTS.md'), `\uFEFF${CRLF(`antes\n\n${BLOCK}\ndespués\n`)}`);
});

test('AGENTS.md: sin marcadores se añade al final y es idempotente; sin fichero se crea', () => {
  for (const text of ['solo texto', 'solo texto\n', 'solo texto\n\n\n']) {
    const p = proj({ 'AGENTS.md': text });
    assert.equal(exec(BASE, p, APPLY).code, 0);
    assert.equal(rd(p, 'AGENTS.md'), `solo texto\n\n${BLOCK}`);
    assert.match(exec(BASE, p, APPLY).out, /Nada que aplicar/);
  }
  const q = proj({ 'AGENTS.md': null });
  assert.equal(exec(BASE, q, APPLY).code, 0);
  assert.equal(rd(q, 'AGENTS.md'), BLOCK);
});

test('AGENTS.md: --apply aborta sin escribir con marcadores duplicados o con una valla sin cerrar', () => {
  for (const [text, re] of [[BLOCK + BLOCK, /duplicados o desbalanceados/], ['```\nsin cerrar\n', /sin cerrar/]]) {
    const p = proj({ 'AGENTS.md': text });
    const r = exec(BASE, p, APPLY);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, re);
    assert.equal(rd(p, 'AGENTS.md'), text);
  }
});

test('AGENTS.md registrado como enlace simbólico: --check da 1 y --apply 2, sin escribir', () => {
  const p = proj({ 'AGENTS.md': 'solo texto\n' }, { link: 'AGENTS.md' });
  for (const [args, code] of [[['--check'], 1], [APPLY, 2]]) {
    const r = exec(BASE, p, args);
    assert.equal(r.code, code, r.out);
    assert.match(r.out, /enlace\(s\) simbólico\(s\) en el proyecto/);
    assert.doesNotMatch(r.out, /sin confirmar/); // la guarda de enlaces sale antes que la de árbol limpio
  }
  assert.equal(rd(p, 'AGENTS.md'), 'solo texto\n');
});

test('AGENTS.md: --diff enseña solo el cambio del bloque', () => {
  const r = exec(BASE, proj({ 'AGENTS.md': `antes\n${STALE}` }), ['--diff']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^-- otro/m);
  assert.match(r.out, /^\+- uno/m);
  assert.doesNotMatch(r.out, /^-antes/m);
});

test('el bloque real de AGENTS.md coincide con su fuente en la plantilla', () => {
  const src = '.harness/agents-block.md';
  const t = repo({ [src]: fs.readFileSync(path.join(REPO, src), 'utf8') }, { manifest: { ...MANIFEST, blockSource: src, excluded: [src] }, tags: ['v1.0.0'] });
  const r = run(t, proj({ 'AGENTS.md': fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8') }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /bloque gestionado al día/);
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
  assert.ok(files[m.blockSource], `blockSource ${m.blockSource} no es un fichero rastreado`);
});

test('la capa 0 de la política (el bloque) no nombra modelos: eso es de docs/modelos.md', () => {
  const block = fs.readFileSync(path.join(REPO, '.harness', 'agents-block.md'), 'utf8');
  assert.deepEqual(block.match(/\b(opus|sonnet|haiku|fable|gpt|gemini)\b/gi), null);
  for (const tier of ['frontier', 'balanced', 'fast']) assert.match(block, new RegExp(`\`${tier}\``));
});

test('CLAUDE.md y GEMINI.md importan AGENTS.md', () => {
  const lines = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').split(/\r?\n/);
  assert.ok(lines('CLAUDE.md').includes('@AGENTS.md'), 'CLAUDE.md necesita la línea @AGENTS.md');
  assert.ok(lines('GEMINI.md').includes('@./AGENTS.md'), 'GEMINI.md necesita la línea @./AGENTS.md');
});

// Sin parser de YAML en el repo: reglas de escalares planos (un ": " sin comillas rompe el YAML y GitHub ignora la plantilla en silencio).
test('la plantilla de issue tiene un front matter con name y about que GitHub puede leer', () => {
  const text = fs.readFileSync(path.join(REPO, '.github', 'ISSUE_TEMPLATE', 'tarea.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'sin front matter entre ---');
  const keys = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    assert.ok(kv, `no es "clave: valor": ${line}`);
    const [, key, v] = kv;
    if (/^["']/.test(v)) assert.ok(v.length > 1 && v.endsWith(v[0]), `${key}: comillas sin cerrar`);
    else assert.ok(!/: | #/.test(v), `${key}: un valor sin comillas no puede llevar ": " ni " #" (YAML inválido)`);
    keys[key] = v;
  }
  for (const k of ['name', 'about']) assert.ok(keys[k] && !/^(""|'')$/.test(keys[k]), `falta ${k}`);
});

test('lo que se propaga a los derivados no cita el ADR ni sus números de decisión (no tienen docs/decisiones/)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'harness.manifest.json'), 'utf8'));
  const covers = (e, f) => (e.endsWith('/') ? f.startsWith(e) : f === e);
  const tracked = git(REPO, 'ls-files', '-z').split('\0').filter(Boolean);
  for (const f of tracked.filter((t) => [...m.template, m.blockSource].some((e) => covers(e, t)))) {
    const hit = /\bADR\b|\bD\d{1,2}\b/.exec(fs.readFileSync(path.join(REPO, f), 'utf8'));
    assert.equal(hit, null, `${f}: cita «${hit?.[0]}», que los derivados no tienen`);
  }
});

const TIER_AGENTS = {
  worker_fast: 'haiku', worker_balanced: 'sonnet', reviewer_frontier: 'opus',
  security_reviewer: 'opus', a11y_seo_auditor: 'sonnet', mentor: 'sonnet',
};
const READ_ONLY = ['reviewer_frontier', 'security_reviewer', 'a11y_seo_auditor', 'mentor'];
const agentFile = (name) => fs.readFileSync(path.join(REPO, '.claude', 'agents', `${name}.md`), 'utf8').replace(/\r\n/g, '\n');

test('los agentes de nivel y los especialistas fijan su modelo y su front matter es válido', () => {
  for (const [name, model] of Object.entries(TIER_AGENTS)) {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(agentFile(name));
    assert.ok(m, `${name}: sin front matter`);
    const meta = {};
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z]+):\s*(.*)$/.exec(line);
      assert.ok(kv, `${name}: no es "clave: valor": ${line}`);
      assert.ok(/^["']/.test(kv[2]) || !/: | #/.test(kv[2]), `${name}.${kv[1]}: valor sin comillas con ": " o " #" (YAML inválido)`);
      meta[kv[1]] = kv[2];
    }
    assert.equal(meta.name, name);
    assert.equal(meta.model, model, `${name}: model`);
    assert.ok(meta.description && meta.tools, `${name}: description y tools`);
    if (READ_ONLY.includes(name)) assert.doesNotMatch(meta.tools, /Write|Edit/, `${name}: es de solo lectura`);
  }
});

test('ni los agentes de nivel ni los especialistas nombran el pipeline que se retira', () => {
  for (const name of Object.keys(TIER_AGENTS)) {
    assert.doesNotMatch(agentFile(name), /craftsman_lead|tdd_craftsman|spec_partner|gherkin_author|mutation_tester|\bjudge\b/i, name);
    assert.doesNotMatch(/^description:.*$/m.exec(agentFile(name))[0], /pipeline|transici[oó]n/i, name);
  }
  for (const name of ['worker_fast', 'worker_balanced', 'reviewer_frontier']) {
    assert.doesNotMatch(agentFile(name), /feature_list|progress\/|\.feature\b/, name);
  }
});

test('el bloque gestionado no conserva la cláusula de transición ni el rol retirado', () => {
  const block = fs.readFileSync(path.join(REPO, '.harness', 'agents-block.md'), 'utf8');
  assert.doesNotMatch(block, /transici[oó]n|craftsman_lead|tdd_craftsman|spec_partner|gherkin_author|mutation_tester|\bjudge\b|pipeline/i);
});

test('CLAUDE.md no vuelve a imponer el rol retirado', () => {
  const claude = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(claude, /craftsman_lead|rol obligatorio/i);
});

test('los 6 agentes del pipeline retirado ya no existen en .claude/agents/', () => {
  for (const name of ['craftsman_lead', 'spec_partner', 'gherkin_author', 'tdd_craftsman', 'judge', 'mutation_tester']) {
    assert.equal(fs.existsSync(path.join(REPO, '.claude', 'agents', `${name}.md`)), false, name);
  }
});

// Un hook es síncrono (Claude espera a que acabe) y, si sale con 1 en rojo, no condiciona nada: la verificación vive en el cierre, la revisión local y la CI.
const HEAVY_HOOK = /\b(?:init\.(?:sh|ps1)|harness(?:\.mjs|\.ps1)?\s+(?:test|init|verify|mutate))\b/;
const heavyHook = (h) => HEAVY_HOOK.test([h.command, ...(h.args ?? [])].join(' '));

test('.claude/settings.json no trae hooks que corran los tests o init tras cada edición o turno', () => {
  assert.ok(heavyHook({ command: 'node .harness/harness.mjs test' }) && heavyHook({ command: 'bin/harness', args: ['init'] }) && heavyHook({ command: 'pwsh ./init.ps1' }), 'el detector no marca lo que debe');
  assert.ok(!heavyHook({ command: 'node .harness/harness.mjs status' }), 'el detector marca de más');
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
  for (const h of Object.values(settings.hooks ?? {}).flatMap((groups) => groups.flatMap((g) => g.hooks ?? []))) {
    assert.ok(!heavyHook(h), `un hook ejecuta «${h.command}»: bloquea a Claude y, si sale con 1 en rojo, no condiciona nada; la verificación va en el cierre, la revisión local y la CI`);
  }
});

test('docs/modelos.md recoge, en una misma línea, cada agente y su modelo', () => {
  const lines = fs.readFileSync(path.join(REPO, 'docs', 'modelos.md'), 'utf8').split('\n');
  for (const [name, model] of Object.entries(TIER_AGENTS)) {
    assert.ok(lines.some((l) => l.includes(`\`${name}\``) && l.includes(`\`${model}\``)), `${name} → ${model}`);
  }
});

const USER_INSTRUCTIONS_SOURCES = { 'Claude Code': 'code.claude.com', Codex: 'learn.chatgpt.com', Copilot: 'code.visualstudio.com', OpenCode: 'opencode.ai', 'Gemini CLI': 'geminicli.com' };

test('docs/instrucciones-de-usuario.md: la plantilla trae los siete pasos y cada herramienta cita ruta y fuente o dice «sin verificar»', () => {
  const doc = fs.readFileSync(path.join(REPO, 'docs', 'instrucciones-de-usuario.md'), 'utf8').replace(/\r\n/g, '\n');
  const fence = /^```markdown\n([\s\S]*?)\n```$/m.exec(doc);
  assert.ok(fence, 'falta el bloque ```markdown con la plantilla');
  for (let n = 1; n <= 7; n++) assert.match(fence[1], new RegExp(`^## ${n}\\. `, 'm'), `falta el paso ${n}`);
  assert.match(fence[1], /^## Complementos$/m);
  assert.match(fence[1], /si chocan, gana el del repo/); // manda el AGENTS.md del repo
  assert.match(fence[1], /sesión nueva con un título/); // avisar si la petición se sale del objetivo
  assert.match(doc, /^> Consultado el \*\*\d{4}-\d{2}-\d{2}\*\*/m);
  const sources = doc.split(/^## Fuentes$/m)[1] ?? '';
  for (const [tool, host] of Object.entries(USER_INSTRUCTIONS_SOURCES)) {
    const row = doc.split('\n').find((l) => l.startsWith(`| ${tool}`));
    assert.ok(row, `${tool}: sin fila en la tabla de instalación`);
    assert.match(row.split('|')[2], /`~\/[^`]+`/, `${tool}: sin ruta del fichero personal en su celda`);
    assert.ok(/\[R\]/.test(row) ? sources.includes(`https://${host}/`) : /sin verificar/.test(row), `${tool}: ni fuente ([R] y https://${host}/ en «Fuentes») ni «sin verificar»`);
  }
});

/**
 * Cada `Join-Path` de un script PowerShell: su línea, cuántos segmentos pasa y si usa -AdditionalChildPath.
 * Windows PowerShell 5.1 solo admite dos (Path y ChildPath); `Join-Path a b c` es de PowerShell 6+.
 */
function joinPathCalls(src) {
  const code = src.replace(/<#[\s\S]*?#>/g, (c) => c.replace(/[^\n]/g, ' '));
  const calls = [];
  for (const m of code.matchAll(/\bJoin-Path\b/gi)) {
    const lineStart = code.lastIndexOf('\n', m.index) + 1;
    if (code.slice(lineStart, m.index).replace(/'[^']*'|"[^"]*"/g, '').includes('#')) continue; // comentario
    const tokens = [];
    let tok = '';
    let depth = 0;
    const flush = () => { if (tok) tokens.push(tok); tok = ''; };
    for (let i = m.index + m[0].length; i < code.length; i++) {
      const c = code[i];
      if (c === "'" || c === '"') { // cadena: un solo token, aunque lleve espacios
        let j = i + 1;
        while (j < code.length && code[j] !== c) j += c === '"' && code[j] === '`' ? 2 : 1;
        tok += code.slice(i, j + 1);
        i = j;
        continue;
      }
      if (/[([{]/.test(c)) depth++;
      else if (/[)\]}]/.test(c)) { if (!depth) break; depth--; } // cierra la llamada que envuelve a esta
      else if (!depth && (c === ';' || c === '|' || c === '\n' || c === '\r' || (c === '#' && !tok))) break;
      else if (!depth && /\s/.test(c)) { flush(); continue; }
      tok += c;
    }
    flush();
    let segments = 0;
    let additional = false;
    for (let k = 0; k < tokens.length; k++) {
      if (!/^-[A-Za-z]+$/.test(tokens[k])) { segments++; continue; }
      const name = tokens[k].slice(1).toLowerCase();
      if (name === 'resolve') continue; // interruptor: sin valor
      k++; // el valor del parámetro con nombre
      if (name === 'additionalchildpath') additional = true;
      else if (name === 'path' || name === 'childpath') segments++;
    }
    calls.push({ line: code.slice(0, m.index).split('\n').length, segments, additional });
  }
  return calls;
}

test('el detector de Join-Path cuenta los segmentos que Windows PowerShell 5.1 admite', () => {
  const seen = (s) => joinPathCalls(s).map((c) => (c.additional ? 'adicional' : c.segments));
  assert.deepEqual(seen("Join-Path $r '..' '.harness' 'harness.mjs'"), [4]);
  assert.deepEqual(seen("Join-Path (Join-Path (Join-Path $r '..') '.harness') 'harness.mjs'"), [2, 2, 2]);
  assert.deepEqual(seen("$x = Join-Path -Path $r -ChildPath 'a b' -Resolve"), [2]);
  assert.deepEqual(seen("Join-Path -Path $r 'a' 'b'"), [3]);
  assert.deepEqual(seen("Join-Path $r 'a' -AdditionalChildPath 'b'"), ['adicional']);
  assert.deepEqual(seen('"$(Join-Path $r \'a\' \'b\')"'), [3]);
  assert.deepEqual(seen("$p = (Join-Path $r 'a b') | Out-Null"), [2]);
  assert.deepEqual(seen("# Join-Path $r 'a' 'b'\nJoin-Path $r 'a' # y 'b' 'c'\n<# Join-Path a b c #>"), [2]);
});

test('los .ps1 que se propagan no usan Join-Path con más de dos segmentos (Windows PowerShell 5.1 no lo admite)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(REPO, 'harness.manifest.json'), 'utf8'));
  const covers = (e, f) => (e.endsWith('/') ? f.startsWith(e) : f === e);
  const scripts = git(REPO, 'ls-files', '-z').split('\0').filter((f) => f.endsWith('.ps1') && m.template.some((e) => covers(e, f)));
  assert.ok(scripts.includes('bin/harness.ps1') && scripts.includes('init.ps1'), `faltan los lanzadores en ${scripts}`);
  let total = 0;
  for (const f of scripts) {
    for (const c of joinPathCalls(fs.readFileSync(path.join(REPO, f), 'utf8'))) {
      total++;
      assert.ok(c.segments <= 2 && !c.additional, `${f}:${c.line}: Join-Path con más de dos segmentos; Windows PowerShell 5.1 solo admite dos (anida las llamadas)`);
    }
  }
  assert.ok(total >= 2, 'el detector no encontró ningún Join-Path: la comprobación no vale');
});

/**
 * Pasos `actions/setup-node` de un workflow y si fijan `package-manager-cache: false` o un `cache:` explícito.
 * Sin parser de YAML en el repo: un paso es el bloque que arranca en su línea `- ` y llega hasta la siguiente línea con su misma sangría o menos.
 */
function setupNodeSteps(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/(^|\s)#.*$/, ''));
  const indent = (l) => l.length - l.trimStart().length;
  const isItem = (l) => /^\s*-\s/.test(l);
  const steps = [];
  lines.forEach((l, i) => {
    if (!/^\s*(?:-\s+)?uses:\s*["']?actions\/setup-node@/.test(l)) return;
    let start = i;
    while (!isItem(l) && start > 0 && !(isItem(lines[start]) && indent(lines[start]) < indent(l))) start--;
    let end = start + 1;
    while (end < lines.length && (!lines[end].trim() || indent(lines[end]) > indent(lines[start]))) end++;
    const block = lines.slice(start, end).join('\n');
    steps.push({ line: i + 1, ok: /^\s*package-manager-cache:\s*["']?false["']?\s*$/m.test(block) || /^\s*cache:\s*["']?[A-Za-z]/m.test(block) });
  });
  return steps;
}

test('el detector de setup-node distingue los pasos con el caché automático desactivado', () => {
  const ok = (s) => setupNodeSteps(s).map((x) => x.ok);
  const step = (withLines) => `      - uses: actions/setup-node@v5\n        with:\n          node-version: "22"\n${withLines}`;
  assert.deepEqual(ok(step('')), [false]);
  assert.deepEqual(ok(step('          package-manager-cache: false\n')), [true]);
  assert.deepEqual(ok(step('          package-manager-cache: "false"\n')), [true]);
  assert.deepEqual(ok(step('          package-manager-cache: true\n')), [false]);
  assert.deepEqual(ok(step('          cache: npm\n')), [true]);
  assert.deepEqual(ok(step('          cache-dependency-path: x\n')), [false]);
  assert.deepEqual(ok(step('          # package-manager-cache: false\n')), [false]);
  assert.deepEqual(ok('      - name: Node\n        uses: actions/setup-node@v5\n        with:\n          package-manager-cache: false\n'), [true]);
  // cada paso con lo suyo: la línea del paso siguiente no cuenta para el anterior
  assert.deepEqual(ok(`${step('          package-manager-cache: false\n')}${step('')}`), [true, false]);
  assert.deepEqual(ok(`${step('')}${step('          package-manager-cache: false\n')}`), [false, true]);
  assert.deepEqual(ok('      - uses: actions/checkout@v5\n        with:\n          package-manager-cache: false\n'), []);
});

test('todo paso actions/setup-node de los workflows desactiva el caché automático (con pnpm en el derivado falla antes de llegar al script)', () => {
  const flows = git(REPO, 'ls-files', '-z').split('\0').filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  const found = {};
  for (const f of flows) {
    const steps = setupNodeSteps(fs.readFileSync(path.join(REPO, f), 'utf8'));
    found[f] = steps.length;
    for (const s of steps) assert.ok(s.ok, `${f}:${s.line}: actions/setup-node sin «package-manager-cache: false» ni «cache:» explícito; con «packageManager: pnpm» en el package.json activa el caché y falla porque pnpm aún no está instalado`);
  }
  assert.ok(found['.github/workflows/pr-body.yml'] >= 1, 'el detector no halló setup-node en pr-body.yml (el que se propaga): la comprobación no vale');
});

// AGENTS.md corto y con las cinco secciones del proyecto; CLAUDE.md mínimo (solo importa AGENTS.md y añade lo propio de Claude Code).
const PROJECT_SECTIONS = [/^resumen del proyecto/i, /^ficheros clave/i, /^desarrollo y validaci[oó]n/i, /^guardarra[ií]les/i, /^definici[oó]n de hecho/i];
const readRepo = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const lineCount = (src) => src.replace(/\n$/, '').split('\n').length;
const projectPart = (src) => src.replace(/<!-- harness:begin[\s\S]*?<!-- harness:end -->\n?/, ''); // la parte del bloque gestionado no es del proyecto

/** Encabezados `## ` (con o sin número) fuera de vallas de código y de comentarios HTML, con el texto que les sigue hasta el siguiente. */
function h2Sections(src) {
  const sections = [];
  let fence = null; // el marcador (``` o ~~~) que abrió la valla: solo ese la cierra
  for (const line of src.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const marker = /^\s*(```|~~~)/.exec(line)?.[1];
    if (marker && (fence === null || fence === marker)) fence = fence === null ? marker : null;
    const h = fence === null && !marker && /^##\s+(?:\d+\.\s+)?(.+?)\s*$/.exec(line);
    if (h) sections.push({ title: h[1], body: '' });
    else if (sections.length) sections.at(-1).body += `${line}\n`;
  }
  return sections;
}
const hasContent = (s) => s.body.split('\n').some((l) => l.trim() && !/^#{1,6}(?:\s|$)/.test(l.trim())); // un `###` suelto no es contenido

test('el detector de secciones de AGENTS.md ignora vallas, comentarios y niveles distintos, quita la numeración y deja ver las secciones vacías', () => {
  const view = (s) => h2Sections(s).map((x) => [x.title, x.body.trim()]);
  assert.deepEqual(view('# T\n\n## 1. Resumen del proyecto\nalgo\n## Ficheros clave\n'), [['Resumen del proyecto', 'algo'], ['Ficheros clave', '']]);
  assert.deepEqual(h2Sections('## A\n```\n## B\n```\n~~~\n## C\n~~~\n### D\n#### E\n').map((x) => x.title), ['A']);
  assert.deepEqual(h2Sections('## A\n~~~\n```\n## B\n```\n~~~\n## C\n').map((x) => x.title), ['A', 'C']); // un ``` dentro de ~~~ no cierra la valla
  assert.deepEqual(h2Sections('## A\n<!--\n## B\n-->\n## C\n').map((x) => x.title), ['A', 'C']);
  assert.deepEqual(h2Sections('##Sin espacio\n## 12. Doce\n').map((x) => x.title), ['Doce']);
  assert.deepEqual(h2Sections('## A\n### Sub\n\n## B\ntexto\n').map(hasContent), [false, true]);
  assert.equal(projectPart('a\n<!-- harness:begin x -->\n## B\n<!-- harness:end -->\nc\n'), 'a\nc\n');
});

test('AGENTS.md trae, en este orden, las cinco secciones del proyecto y todas tienen contenido', () => {
  const sections = h2Sections(projectPart(readRepo('AGENTS.md')));
  const titles = sections.map((s) => s.title).join(' | ');
  let last = -1;
  for (const re of PROJECT_SECTIONS) {
    const at = sections.findIndex((s) => re.test(s.title));
    assert.ok(at > last, `${re}: falta o está fuera de orden entre los encabezados «${titles}»`);
    assert.ok(hasContent(sections[at]), `${re}: sección vacía`);
    last = at;
  }
});

test('AGENTS.md tiene menos de 200 líneas (se carga entero en cada sesión)', () => {
  const n = lineCount(readRepo('AGENTS.md'));
  assert.ok(n < 200, `AGENTS.md tiene ${n} líneas; debe tener menos de 200 (el objetivo, unas 100)`);
});

test('la parte del proyecto de AGENTS.md no cita el ADR ni el seguimiento retirado', () => {
  const text = projectPart(readRepo('AGENTS.md'));
  const hit = /\badr\b|docs\/decisiones/i.exec(text) ?? /\bD\d{1,2}\b/.exec(text) ?? /feature_list|progress\/|project-spec|una sola feature/i.exec(text);
  assert.equal(hit, null, `AGENTS.md cita «${hit?.[0]}», que los derivados no tienen o está retirado`);
});

test('el paso de memoria organizacional está en «Desarrollo y validación» de AGENTS.md, donde lo ven todas las herramientas', () => {
  const dev = h2Sections(projectPart(readRepo('AGENTS.md'))).find((s) => PROJECT_SECTIONS[2].test(s.title));
  assert.match(dev?.body ?? '', /sync-memoria/); // antes solo lo veía Claude Code, desde el «paso 2bis» de CLAUDE.md
});

test('CLAUDE.md es mínimo: no repite el arranque de AGENTS.md, solo nombra rutas que se propagan y es de la plantilla', () => {
  const text = readRepo('CLAUDE.md');
  const m = JSON.parse(readRepo('harness.manifest.json'));
  assert.ok(lineCount(text) <= 20, `CLAUDE.md tiene ${lineCount(text)} líneas; mínimo = importar AGENTS.md y lo propio de Claude Code (tope 20)`);
  assert.doesNotMatch(text, /2bis|Protocolo de arranque/);
  assert.ok(m.template.includes('CLAUDE.md') && !m.project.includes('CLAUDE.md'), 'CLAUDE.md mínimo es de la plantilla: va en «template», no en «project»');
  // lo mixto (settings.json) y lo excluido (sync-memoria) no llegan al derivado, y este fichero no se personaliza allí
  const reaches = (f) => [...m.template, ...m.mixedBlock].some((e) => (e.endsWith('/') ? f.startsWith(e) : f === e));
  const paths = [...text.matchAll(/`([^`\s]+)`/g)].map((x) => x[1]).filter((p) => !p.startsWith('/') && (p.includes('/') || /\.\w+$/.test(p)));
  assert.ok(paths.length >= 2, 'el detector no halló rutas en CLAUDE.md: la comprobación no vale');
  for (const p of paths) assert.ok(reaches(p), `CLAUDE.md nombra «${p}», que la plantilla no propaga a los derivados`);
});
