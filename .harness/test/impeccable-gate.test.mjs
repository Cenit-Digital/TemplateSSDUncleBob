// impeccable-gate.test.mjs — Tests de .harness/impeccable-gate.mjs (la puerta de diseño de la CI).
//
// Casi todos sustituyen el detector por un doble (`run`) y comprueban las reglas de la puerta. Los dos últimos lanzan el
// detector real fijado (npx impeccable@<versión>, necesita red): sobre el código y sobre una página servida en local con
// un navegador real (este se salta, diciéndolo, si la máquina no tiene ninguno). Son la prueba de que el código 0
// significa «limpio» y de que la puerta se fía de él solo cuando no hay ninguna entrada.
//
//   node --test .harness/test/impeccable-gate.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { gate, checkInline, checkConfig, findBrowser, VERSION, SKILL_DIRS, VIEWPORTS } from '../impeccable-gate.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(REPO, '.harness', 'impeccable-gate.mjs');
const dirs = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const CLEAN_HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title></head><body><main><h1>Hola</h1><p>Texto.</p></main></body></html>\n';
const DIRTY_HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>X</title><style>h1{background:linear-gradient(90deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;color:transparent}</style></head><body><h1>Hola</h1></body></html>\n';

/** Proyecto temporal con la skill «instalada» (solo lo que mira la puerta) y `files`; `ui` va a harness.config.json. */
function project({ ui, files = {}, version = VERSION } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-gate-'));
  dirs.push(d);
  const all = { 'harness.config.json': JSON.stringify({ project: 't', commands: {}, ...(ui === null ? {} : { ui: ui ?? { paths: [], routes: [] } }) }), ...files };
  if (ui && ui.paths?.length && !('.github/workflows/e2e.yml' in all)) all['.github/workflows/e2e.yml'] = 'jobs:\n  e2e:\n    steps:\n      - run: node .harness/impeccable-gate.mjs --rendered http://127.0.0.1:4173/\n';
  for (const s of SKILL_DIRS) {
    const meta = s.startsWith('.claude') ? `version: ${version}` : `metadata:\n  version: ${version}`;
    if (!(`${s}/SKILL.md` in all)) all[`${s}/SKILL.md`] = `---\nname: impeccable\n${meta}\n---\n`;
    if (!(`${s}/LICENSE` in all)) all[`${s}/LICENSE`] = 'Apache License\n';
    if (!(`${s}/NOTICE.md` in all)) all[`${s}/NOTICE.md`] = '# Notices\n';
  }
  for (const [f, body] of Object.entries(all)) {
    if (body === null) continue;
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), body);
  }
  return d;
}

const WEB = { paths: ['web'], routes: ['/'] };

/** Ejecuta la puerta con un detector de mentira y captura lo que imprime. */
function withFake(root, result, opts = {}) {
  const calls = [];
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(String(s));
  try {
    const code = gate(root, { check: () => 200, ...opts, run: (r, args, env) => { calls.push({ args, browser: env.IMPECCABLE_BROWSER }); return { stderr: '', ...result }; } });
    return { code, calls, out: lines.join('\n') };
  } finally { console.log = log; }
}

test('sin ui.paths: no ejecuta el detector, lo dice y sale con 0', () => {
  const r = withFake(project(), { code: 2, findings: [{}] });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.calls.length, 0);
  assert.match(r.out, /no declara web/);
});

test('sin ui.paths pero sin la skill (o en otra versión): falla', () => {
  assert.equal(withFake(project({ files: { [`${SKILL_DIRS[1]}/SKILL.md`]: null } }), { code: 0, findings: [] }).code, 1);
  const r = withFake(project({ version: '4.9.0' }), { code: 0, findings: [] });
  assert.equal(r.code, 1);
  assert.match(r.out, /versión 4\.9\.0/);
});

test('falta LICENSE o NOTICE.md de la skill: falla', () => {
  const r = withFake(project({ files: { [`${SKILL_DIRS[0]}/NOTICE.md`]: null } }), { code: 0, findings: [] });
  assert.equal(r.code, 1);
  assert.match(r.out, /NOTICE\.md: falta/);
});

test('con web limpia: ejecuta el detector sobre ui.paths y sale con 0', () => {
  const r = withFake(project({ ui: WEB, files: { 'web/index.html': CLEAN_HTML } }), { code: 0, findings: [] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls.map((c) => c.args), [['--report-unused-ignores', ['web/index.html']]]);
  assert.match(r.out, /Solo reglas por patrón/);
  assert.match(r.out, /0 hallazgos y 0 avisos/);
});

test('hallazgos y avisos cuentan; un aviso con código 0 también suspende', () => {
  const root = project({ ui: WEB, files: { 'web/index.html': CLEAN_HTML } });
  const advisory = { antipattern: 'em-dash-overuse', advisory: true, file: path.join(root, 'web/index.html'), snippet: '10 em-dashes' };
  const r = withFake(root, { code: 0, findings: [advisory] });
  assert.equal(r.code, 1);
  assert.match(r.out, /web\/index\.html \[em-dash-overuse\] \(aviso\)/);
  assert.equal(withFake(root, { code: 2, findings: [{ antipattern: 'side-tab', file: 'x' }] }).code, 1);
  assert.equal(withFake(root, { code: 2, findings: [] }).code, 2, 'código 2 sin entradas no es limpio');
});

test('el detector no pudo escanear (1), su salida no es JSON o avisó por stderr (análisis incompleto): sale con 2', () => {
  const root = project({ ui: WEB, files: { 'web/index.html': CLEAN_HTML } });
  assert.equal(withFake(root, { code: 1, findings: [] }).code, 2);
  assert.equal(withFake(root, { code: 0, findings: null }).code, 2);
  const r = withFake(root, { code: 0, findings: [], stderr: 'impeccable detect: could not read linked stylesheet /x.css' });
  assert.equal(r.code, 2);
  assert.match(r.out, /análisis incompleto/);
});

test('con web hace falta ui.routes (las reglas de página solo corren renderizado)', () => {
  const r = withFake(project({ ui: { paths: ['web'] }, files: { 'web/index.html': CLEAN_HTML } }), { code: 0, findings: [] });
  assert.equal(r.code, 1);
  assert.equal(r.calls.length, 0);
  assert.match(r.out, /ui\.routes/);
  assert.throws(() => withFake(project({ ui: { paths: ['web'], routes: ['servicios'] } }), { code: 0, findings: [] }), /ui\.routes/);
});

test('--rendered: cada ruta en los dos tamaños, con un envoltorio del navegador; limpio → 0, un hallazgo → 1', () => {
  const browser = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-gate-b-')), 'chrome');
  dirs.push(path.dirname(browser));
  fs.writeFileSync(browser, '#!/bin/sh\n', { mode: 0o755 });
  const root = project({ ui: { paths: ['web'], routes: ['/', '/reservar'] }, files: { 'web/index.html': CLEAN_HTML } });
  const env = { ...process.env, IMPECCABLE_BROWSER: browser };
  const r = withFake(root, { code: 0, findings: [] }, { rendered: 'http://localhost:4310/base', env });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls.map((c) => c.args), [
    ['--viewport', VIEWPORTS[0], ['http://localhost:4310/base/']], ['--viewport', VIEWPORTS[1], ['http://localhost:4310/base/']],
    ['--viewport', VIEWPORTS[0], ['http://localhost:4310/base/reservar']], ['--viewport', VIEWPORTS[1], ['http://localhost:4310/base/reservar']],
  ]);
  assert.ok(r.calls.every((c) => c.browser !== browser && /impeccable-gate-/.test(c.browser)), 'el detector recibe el envoltorio, no el navegador');
  assert.equal(withFake(root, { code: 2, findings: [{ antipattern: 'low-contrast', file: 'http://localhost:4310/base/' }] }, { rendered: 'http://localhost:4310/base', env }).code, 1);
});

test('--rendered sin navegador sale con 2 (no se salta); sin web o con una URL inválida, también', () => {
  const root = project({ ui: WEB, files: { 'web/index.html': CLEAN_HTML } });
  const env = { PATH: '', HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-gate-h-')), PLAYWRIGHT_BROWSERS_PATH: '/no/existe' };
  dirs.push(env.HOME);
  const r = withFake(root, { code: 0, findings: [] }, { rendered: 'http://localhost:4310/', env });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /no hay navegador/);
  assert.equal(withFake(project(), { code: 0, findings: [] }, { rendered: 'http://localhost:4310/' }).code, 2);
  assert.throws(() => withFake(root, { code: 0, findings: [] }, { rendered: 'ftp://x' }), /http\(s\)/);
});

test('una ruta que no existe o sin nada que analizar falla sin llamar al detector', () => {
  for (const files of [{}, { 'web/README.md': '# x\n' }]) {
    const r = withFake(project({ ui: WEB, files }), { code: 0, findings: [] });
    assert.equal(r.code, 1, r.out);
    assert.equal(r.calls.length, 0);
  }
});

test('sin la clave ui en harness.config.json: error (hay que declarar si hay web o no)', () => {
  assert.throws(() => withFake(project({ ui: null }), { code: 0, findings: [] }), /falta "ui\.paths"/);
  const r = spawnSync(process.execPath, [GATE], { cwd: project({ ui: null }), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 2, r.stdout);
});

test('el detector recibe la lista exacta de ficheros (también dentro de build/ o dist/, y .ts/.js)', () => {
  const r = withFake(project({ ui: WEB, files: { 'web/build/a.css': 'p{}\n', 'web/x.ts': 'export {};\n', 'web/README.md': '# x\n', 'web/node_modules/y.css': 'p{}\n' } }), { code: 0, findings: [] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls[0].args[1].sort(), ['web/build/a.css', 'web/x.ts']);
});

test('ui.paths con rutas inseguras (o que parecen opciones): error de configuración', () => {
  assert.throws(() => withFake(project({ ui: { paths: ['--no-config'], routes: ['/'] } }), { code: 0, findings: [] }), /rutas relativas seguras/);
  assert.throws(() => withFake(project({ ui: { paths: ['../fuera'] } }), { code: 0, findings: [] }), /rutas relativas seguras/);
});

test('hooks: la puerta falla si .claude/settings.json o .codex/hooks.json traen Impeccable, o si el config no los apaga', () => {
  const base = { ui: WEB, files: { 'web/index.html': CLEAN_HTML } };
  for (const f of ['.claude/settings.json', '.codex/hooks.json']) {
    const r = withFake(project({ ...base, files: { ...base.files, [f]: '{"hooks":{"PostToolUse":[{"command":"impeccable hook"}]}}' } }), { code: 0, findings: [] });
    assert.equal(r.code, 1, f);
  }
  const permiso = project({ ...base, files: { ...base.files, '.claude/settings.json': '{"permissions":{"allow":["Bash(npx impeccable@4.10.0 detect:*)"]}}' } });
  assert.equal(withFake(permiso, { code: 0, findings: [] }).code, 0, 'un permiso no es un hook');
  assert.equal(withFake(project({ ...base, files: { ...base.files, '.github/hooks/impeccable.json': '{}' } }), { code: 0, findings: [] }).code, 1);
  const on = project({ ...base, files: { ...base.files, '.impeccable/config.json': '{"hook":{"enabled":true}}' } });
  assert.match(checkConfig(on).join('\n'), /hook\.enabled/);
  const off = project({ ...base, files: { ...base.files, '.impeccable/config.json': '{"hook":{"enabled":false},"detector":{"ignoreRules":[],"ignoreFiles":[],"ignoreValues":[]}}' } });
  assert.deepEqual(checkConfig(off), []);
});

test('excepciones en config: ignoreRules e ignoreFiles no; ignoreValues solo con motivo', () => {
  const cfg = (detector) => project({ files: { '.impeccable/config.json': JSON.stringify({ hook: { enabled: false }, detector }) } });
  assert.match(checkConfig(cfg({ ignoreRules: ['side-tab'] })).join(), /ignoreRules/);
  assert.match(checkConfig(cfg({ ignoreFiles: ['a.html'] })).join(), /ignoreFiles/);
  assert.match(checkConfig(cfg({ ignoreValues: [{ rule: 'overused-font', value: 'inter' }] })).join(), /sin motivo|no tiene motivo/);
  assert.deepEqual(checkConfig(cfg({ ignoreValues: [{ rule: 'overused-font', value: 'inter', reason: 'Marca del cliente: su tipografía corporativa' }] })), []);
  assert.match(checkConfig(cfg({ ignoreValues: [{ rule: 'overused-font', value: '*', files: ['**'], reason: 'marca' }] })).join(), /comodín/);
  assert.match(checkConfig(cfg({ ignoreValues: [{ rule: 'overused-font', value: ' * ', reason: 'marca' }] })).join(), /comodín/);
  assert.match(checkConfig(cfg({ designSystem: { enabled: false } })).join(), /designSystem/);
  const local = project({ files: { '.impeccable/config.local.json': '{"detector":{"ignoreRules":["overused-font"]}}' } });
  assert.match(checkConfig(local).join(), /config\.local\.json/);
});

test('excepciones en línea: con motivo tras «:» o «--» valen en HTML, CSS y JSX; sin motivo, no', () => {
  const root = project({ files: {
    'ok.html': '<!-- impeccable-disable-next-line overused-font: marca del cliente -->\n',
    'ok.css': '/* impeccable-disable-line side-tab -- marca del cliente */\n',
    'ok.tsx': '{/* impeccable-disable gradient-text: logotipo del cliente */}\n',
    'mal.html': '<!-- impeccable-disable-next-line overused-font -->\n',
    'mal.css': '/* impeccable-disable-line side-tab */\n',
    'mal.tsx': '{/* impeccable-disable gradient-text: */}\n',
    'ok.ts': '// impeccable-disable-next-line overused-font -- tipografía corporativa del cliente\n',
    'codigo.css': '/* impeccable-disable-line overused-font */ .x { font-family: Inter, sans-serif; }\n',
    'codigo.html': '<!-- impeccable-disable-next-line overused-font --><p style="color: red">x</p>\n',
    'todo.css': '/* impeccable-disable * -- marca */\n',
    'sinreglas.html': '<!-- impeccable-disable: marca -->\n',
  } });
  const names = ['ok.html', 'ok.css', 'ok.tsx', 'ok.ts', 'mal.html', 'mal.css', 'mal.tsx', 'codigo.css', 'codigo.html', 'todo.css', 'sinreglas.html'];
  const problems = checkInline(root, names.map((f) => path.join(root, f)));
  assert.deepEqual([...new Set(problems.map((p) => p.split(':')[0]))].sort(), ['codigo.css', 'codigo.html', 'mal.css', 'mal.html', 'mal.tsx', 'sinreglas.html', 'todo.css']);
  assert.match(problems.join('\n'), /todo\.css:1: la excepción no nombra sus reglas/);
});

test('la CLI sale con 0 sin web, y con 2 ante un harness.config.json ilegible o argumentos desconocidos', () => {
  const extra = spawnSync(process.execPath, [GATE, '--otro'], { cwd: project(), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(extra.status, 2, extra.stdout);
  const ok = spawnSync(process.execPath, [GATE], { cwd: project(), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = project({ files: { 'harness.config.json': '{' } });
  const r = spawnSync(process.execPath, [GATE], { cwd: bad, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test(`detector real (impeccable@${VERSION}): web limpia → 0; gradiente en el texto → 1 con el hallazgo; ignorado sin uso → 1`, () => {
  const cli = (files) => spawnSync(process.execPath, [GATE], {
    cwd: project({ ui: WEB, files }), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300_000,
  });
  const clean = cli({ 'web/index.html': CLEAN_HTML });
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /0 hallazgos y 0 avisos/);
  const dirty = cli({ 'web/index.html': DIRTY_HTML });
  assert.equal(dirty.status, 1, dirty.stdout + dirty.stderr);
  assert.match(dirty.stdout, /\[gradient-text\]/);
  const unused = cli({ 'web/index.html': CLEAN_HTML.replace('<h1>', '<!-- impeccable-disable-next-line gradient-text: prueba -->\n<h1>') });
  assert.equal(unused.status, 1, unused.stdout + unused.stderr);
  assert.match(unused.stdout, /\[unused-ignore\]/);
});

const BROWSER = findBrowser();
test(`detector real renderizado (impeccable@${VERSION}): página limpia → 0; gradiente en el texto → 1`, { skip: BROWSER ? false : 'sin navegador en esta máquina (en ubuntu-latest hay Chrome)' }, async () => {
  let html = CLEAN_HTML;
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const root = project({ ui: WEB, files: { 'web/index.html': CLEAN_HTML } });
  const cli = () => new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const p = spawn(process.execPath, [GATE, '--rendered', url], { cwd: root, env: { ...process.env, NO_COLOR: '1' } });
      let stdout = '';
      p.stdout.on('data', (d) => { stdout += d; });
      p.stderr.on('data', (d) => { stdout += d; });
      p.on('close', (status) => resolve({ status, stdout }));
    });
  });
  try {
    const clean = await cli();
    assert.equal(clean.status, 0, clean.stdout);
    assert.match(clean.stdout, /renderizado: 0 hallazgos y 0 avisos en 1 ruta/);
    html = DIRTY_HTML;
    const dirty = await cli();
    assert.equal(dirty.status, 1, dirty.stdout);
    assert.match(dirty.stdout, /\[gradient-text\]/);
  } finally { server.close(); }
});

test('con web, la CI tiene que cablear --rendered', () => {
  const r = withFake(project({ ui: WEB, files: { 'web/index.html': CLEAN_HTML, '.github/workflows/e2e.yml': 'jobs: {}\n' } }), { code: 0, findings: [] });
  assert.equal(r.code, 1);
  assert.match(r.out, /--rendered/);
});

test('--rendered: una ruta que redirige (302 a /login) o no responde no se analiza y suspende', () => {
  const browser = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'impeccable-gate-b-')), 'chrome');
  dirs.push(path.dirname(browser));
  fs.writeFileSync(browser, '#!/bin/sh\n', { mode: 0o755 });
  const root = project({ ui: { paths: ['web'], routes: ['/panel', '/#/reservar'] }, files: { 'web/index.html': CLEAN_HTML } });
  const env = { ...process.env, IMPECCABLE_BROWSER: browser };
  const redirect = withFake(root, { code: 0, findings: [] }, { rendered: 'http://localhost:4310/', env, check: (u) => (u.endsWith('/panel') ? 302 : 200) });
  assert.equal(redirect.code, 1, redirect.out);
  assert.match(redirect.out, /panel: responde 302/);
  assert.deepEqual(redirect.calls.map((c) => c.args[2]), [['http://localhost:4310/#/reservar'], ['http://localhost:4310/#/reservar']]);
  assert.equal(withFake(root, { code: 0, findings: [] }, { rendered: 'http://localhost:4310/', env, check: () => null }).code, 2);
});

