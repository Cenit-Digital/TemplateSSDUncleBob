// impeccable-gate.test.mjs — Tests de .harness/impeccable-gate.mjs (la puerta de diseño de la CI).
//
// Casi todos sustituyen el detector por un doble (`run`) y comprueban las reglas de la puerta. El último lanza el
// detector real fijado (npx impeccable@<versión>, necesita red) sobre una web limpia y otra con hallazgos: es la prueba
// de que el código 0 significa «limpio» y de que la puerta se fía de él solo cuando no hay ninguna entrada.
//
//   node --test .harness/test/impeccable-gate.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gate, checkInline, checkConfig, VERSION, SKILL_DIRS } from '../impeccable-gate.mjs';

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
  const all = { 'harness.config.json': JSON.stringify({ project: 't', commands: {}, ...(ui ? { ui } : {}) }), ...files };
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

/** Ejecuta la puerta con un detector de mentira y captura lo que imprime. */
function withFake(root, result) {
  const calls = [];
  const lines = [];
  const log = console.log;
  console.log = (s) => lines.push(String(s));
  try {
    const code = gate(root, { run: (r, p) => { calls.push(p); return result; } });
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
  const r = withFake(project({ ui: { paths: ['web'] }, files: { 'web/index.html': CLEAN_HTML } }), { code: 0, findings: [] });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls, [['web']]);
  assert.match(r.out, /0 hallazgos y 0 avisos/);
});

test('hallazgos y avisos cuentan; un aviso con código 0 también suspende', () => {
  const root = project({ ui: { paths: ['web'] }, files: { 'web/index.html': CLEAN_HTML } });
  const advisory = { antipattern: 'em-dash-overuse', advisory: true, file: path.join(root, 'web/index.html'), snippet: '10 em-dashes' };
  const r = withFake(root, { code: 0, findings: [advisory] });
  assert.equal(r.code, 1);
  assert.match(r.out, /web\/index\.html \[em-dash-overuse\] \(aviso\)/);
  assert.equal(withFake(root, { code: 2, findings: [{ antipattern: 'side-tab', file: 'x' }] }).code, 1);
  assert.equal(withFake(root, { code: 2, findings: [] }).code, 1, 'código 2 sin entradas no es limpio');
});

test('el detector no pudo escanear (1) o su salida no es JSON: sale con 2', () => {
  const root = project({ ui: { paths: ['web'] }, files: { 'web/index.html': CLEAN_HTML } });
  assert.equal(withFake(root, { code: 1, findings: [] }).code, 2);
  assert.equal(withFake(root, { code: 0, findings: null }).code, 2);
});

test('una ruta que no existe o sin nada que analizar falla sin llamar al detector', () => {
  for (const files of [{}, { 'web/README.md': '# x\n' }]) {
    const r = withFake(project({ ui: { paths: ['web'] }, files }), { code: 0, findings: [] });
    assert.equal(r.code, 1, r.out);
    assert.equal(r.calls.length, 0);
  }
});

test('ui.paths con rutas inseguras: error de configuración', () => {
  assert.throws(() => withFake(project({ ui: { paths: ['../fuera'] } }), { code: 0, findings: [] }), /rutas relativas seguras/);
});

test('hooks: la puerta falla si .claude/settings.json o .codex/hooks.json traen Impeccable, o si el config no los apaga', () => {
  const base = { ui: { paths: ['web'] }, files: { 'web/index.html': CLEAN_HTML } };
  for (const f of ['.claude/settings.json', '.codex/hooks.json']) {
    const r = withFake(project({ ...base, files: { ...base.files, [f]: '{"hooks":{"PostToolUse":[{"command":"impeccable hook"}]}}' } }), { code: 0, findings: [] });
    assert.equal(r.code, 1, f);
  }
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
});

test('excepciones en línea: con motivo tras «:» o «--» valen en HTML, CSS y JSX; sin motivo, no', () => {
  const root = project({ files: {
    'ok.html': '<!-- impeccable-disable-next-line overused-font: marca del cliente -->\n',
    'ok.css': '/* impeccable-disable-line side-tab -- marca del cliente */\n',
    'ok.tsx': '{/* impeccable-disable gradient-text: logotipo del cliente */}\n',
    'mal.html': '<!-- impeccable-disable-next-line overused-font -->\n',
    'mal.css': '/* impeccable-disable-line side-tab */\n',
    'mal.tsx': '{/* impeccable-disable gradient-text: */}\n',
  } });
  const files = ['ok.html', 'ok.css', 'ok.tsx', 'mal.html', 'mal.css', 'mal.tsx'].map((f) => path.join(root, f));
  const problems = checkInline(root, files);
  assert.deepEqual(problems.map((p) => p.split(':')[0]).sort(), ['mal.css', 'mal.html', 'mal.tsx']);
});

test('la CLI sale con 0 sin web y con 2 ante un harness.config.json ilegible', () => {
  const ok = spawnSync(process.execPath, [GATE], { cwd: project(), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = project({ files: { 'harness.config.json': '{' } });
  const r = spawnSync(process.execPath, [GATE], { cwd: bad, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test(`detector real (impeccable@${VERSION}): web limpia → 0; gradiente en el texto → 1 con el hallazgo; ignorado sin uso → 1`, () => {
  const cli = (files) => spawnSync(process.execPath, [GATE], {
    cwd: project({ ui: { paths: ['web'] }, files }), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 300_000,
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
