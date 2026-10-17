// engine.test.mjs — Tests de caracterización del motor del arnés (.harness/harness.mjs).
//
// El motor es TODA la cadena de verificación de la plantilla (init / test / mutate /
// verify / status). Cada caso fija una conducta con una configuración VÁLIDA (la que
// acepta harness.schema.json) contra futuras regresiones. El motor no valida la forma
// de lo que lee: ante un fichero mal formado solo se exige que termine con un [FAIL]
// legible y el exit 2 de la red de seguridad, sin traza (ver el último bloque).
//
// Sin dependencias npm: usa `node:test` (estable desde Node 18, el único requisito del
// arnés). Se corre con la RUTA DE FICHERO explícita:
//
//   node --test .harness/test/engine.test.mjs
//
// (no `node --test .harness/test/`: en Node 22 la forma de directorio intenta cargar la
// carpeta como módulo y revienta con MODULE_NOT_FOUND; la ruta de fichero explícita
// funciona en Node 18+, el mínimo del arnés). El job `Motor (tests)` de
// .github/workflows/harness-ci.yml corre este mismo comando.
//
// El motor llama a `process.exit()` y escribe con console.log, así que cada caso lo
// lanza como SUBPROCESO en un directorio temporal y comprueba el código de salida y la
// salida combinada (stdout+stderr). NO_COLOR=1 evita códigos ANSI.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(HERE, '..', 'harness.mjs');

const _tmpDirs = [];
after(() => {
  for (const d of _tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** Crea un directorio temporal aislado y registra su borrado al final. */
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-eng-'));
  _tmpDirs.push(d);
  return d;
}

/** Escribe un fichero (creando subdirectorios) dentro de `dir`. */
function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/** Serializa un objeto de config/feature_list de forma legible. */
const json = (obj) => JSON.stringify(obj, null, 2);

/**
 * Monta un escenario: escribe harness.config.json (objeto o string crudo) y
 * cualquier fichero extra, y devuelve el directorio.
 *   files: { 'harness.config.json': <obj|string>, 'feature_list.json': <obj>, ... }
 */
function scenario(files) {
  const dir = tmp();
  for (const [rel, content] of Object.entries(files)) {
    const body = typeof content === 'string' ? content : json(content);
    write(dir, rel, body);
  }
  return dir;
}

/** Lanza el motor en `cwd` con `args`; devuelve { status, out }. */
function runEngine(cwd, args = []) {
  const r = spawnSync(process.execPath, [ENGINE, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// Config mínima que hace pasar `init` en verde: hereda el arnés raíz
// (standalone:false, se saltan los ficheros base) y declara una lista de
// features vacía y válida.
const GREEN_FILES = {
  'harness.config.json': { project: 't', standalone: false, commands: {} },
  'feature_list.json': { features: [] },
};

// ── init: entorno y ficheros ────────────────────────────────────────────────

test('init: árbol mínimo válido termina en verde (exit 0)', () => {
  const dir = scenario(GREEN_FILES);
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0);
  assert.match(out, /Entorno listo/);
});

test('init: sin harness.config.json falla con exit 2 y mensaje claro', () => {
  const dir = tmp();
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /No se encontró harness\.config\.json/);
});

test('init: harness.config.json con JSON roto falla con exit 2 y mensaje claro', () => {
  const dir = scenario({ 'harness.config.json': '{ "project": ' });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /harness\.config\.json no es JSON válido/);
});

test('init: standalone:true con ficheros base ausentes falla (exit 1)', () => {
  // standalone por defecto es true → se comprueban AGENTS.md, CLAUDE.md, etc.
  const dir = scenario({
    'harness.config.json': { project: 't', commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Falta archivo base/);
});

// ── config: valores por defecto y valores límite válidos ─────────────────────

test('config: "mutation.threshold" 1.0 (extremo válido del schema) sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      mutation: { threshold: 1.0, targets: [] },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

test('config: "mutation.threshold" 0 (otro extremo válido) sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      mutation: { threshold: 0, targets: [] },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

test('config: "mutation.threshold" ausente asume el default (0.8), sin exigir el campo', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      mutation: { targets: [] },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

test('config: "rules" objeto válido sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { one_feature_at_a_time: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

test('config: flags de "rules" booleanos relajan solo su regla; el resto hereda el default', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { one_feature_at_a_time: false, require_mutation_to_close: false },
    },
    'feature_list.json': {
      features: [
        { id: 1, name: 'a', status: 'in_progress' },
        { id: 2, name: 'b', status: 'in_progress' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out); // one_feature_at_a_time:false permite 2 en in_progress
  assert.match(out, /Entorno listo/);
  assert.doesNotMatch(out, /máximo 1/);
});

test('config: "standalone" ausente asume autónomo (comprueba ficheros base)', () => {
  // Sin ficheros base, init falla por su ausencia: el default true sigue en pie.
  const dir = scenario({
    'harness.config.json': { project: 't', commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Falta archivo base/);
});

test('config: "standalone" false omite los ficheros base y sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /hereda el arnés raíz/);
  assert.match(out, /Entorno listo/);
});

test('config: tolera BOM UTF-8 al parsear harness.config.json', () => {
  const raw = '﻿' + json({ project: 't', standalone: false, commands: {} });
  const dir = scenario({ 'harness.config.json': raw, 'feature_list.json': { features: [] } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

// ── feature_list: estado, una a la vez, ids y names ──────────────────────────

test('feature_list: dos features en in_progress fallan (one_feature_at_a_time)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 'a', status: 'in_progress' },
        { id: 2, name: 'b', status: 'in_progress' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Hay 2 features en in_progress \(máximo 1\)/);
  assert.doesNotMatch(out, /Entorno listo/);
});

test('feature_list: una sola feature en in_progress es válida', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 'a', status: 'in_progress' },
        { id: 2, name: 'b', status: 'pending' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /válido \(2 features\)/);
});

test('feature_list: un estado fuera de la lista falla nombrando la feature y el estado', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'a', status: 'wip' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Estado inválido en feature 1: wip/);
  assert.doesNotMatch(out, /Entorno listo/);
});

test('feature_list: los cinco estados válidos pasan', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: ['pending', 'spec_ready', 'in_progress', 'done', 'blocked']
        .map((s, i) => ({ id: i + 1, name: `f${i}`, status: s })),
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /válido \(5 features\)/);
});

// ── feature_list: flag sdd y puerta de spec ──────────────────────────────────

test('feature_list: sdd:true con su .feature sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_since', sdd: true, status: 'done' }] },
    'features/cli_since.feature': 'Feature: since\n',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

test('feature_list: sdd:false (feature fuera del pipeline SDD) no exige .feature', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'chore', sdd: false, status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /válido \(1 features\)/);
});

test('feature_list: sdd ausente se trata como no-SDD, sin exigir .feature', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'a', status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /válido \(1 features\)/);
});

test('feature_list: feature sdd en PENDING no exige spec (solo spec_ready, in_progress y done)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_add', sdd: true, status: 'pending' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /sin features\//);
});

test('feature_list: feature sdd en BLOCKED no exige spec', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_add', sdd: true, status: 'blocked' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /sin features\//);
});

test('feature_list: feature sdd con name válido pero SIN su .feature falla por el fichero', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_since', sdd: true, status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /feature 1 \(cli_since\) en done sin features\/cli_since\.feature/);
});

test('feature_list: feature sdd con su .feature presente termina en verde', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_since', sdd: true, status: 'done' }] },
    'features/cli_since.feature': 'Feature: since\n',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

test('feature_list: require_approved_spec_to_implement:false omite la puerta de spec (opt-out honrado)', () => {
  // La existencia de features/<name>.feature es la enforcement mecánica de esta regla:
  // con el opt-out, una feature sdd en in_progress SIN su .feature pasa en verde.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_approved_spec_to_implement: false },
    },
    'feature_list.json': { features: [{ id: 1, name: 'cli_add', sdd: true, status: 'in_progress' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
  assert.doesNotMatch(out, /sin features\/cli_add\.feature/);
});

test('feature_list: require_approved_spec_to_implement:true sigue exigiendo el .feature', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_approved_spec_to_implement: true },
    },
    'feature_list.json': { features: [{ id: 1, name: 'cli_add', sdd: true, status: 'in_progress' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /feature 1 \(cli_add\) en in_progress sin features\/cli_add\.feature/);
});

test('feature_list: require_approved_spec_to_implement ausente asume el default (exige el .feature)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_add', sdd: true, status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /feature 1 \(cli_add\) en done sin features\/cli_add\.feature/);
});

test('feature_list: require_approved_spec_to_implement:false no busca ningún .feature', () => {
  // Con la puerta apagada no se deriva ninguna ruta features/<name>.feature, ni siquiera
  // para una feature sdd sin name.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_approved_spec_to_implement: false },
    },
    'feature_list.json': { features: [{ id: 1, sdd: true, status: 'in_progress' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /\.feature/);
});

test('feature_list: require_approved_spec_to_implement:false con el .feature presente sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_approved_spec_to_implement: false },
    },
    'feature_list.json': { features: [{ id: 1, name: 'cli_add', sdd: true, status: 'done' }] },
    'features/cli_add.feature': 'Feature: add\n',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

// ── init: puerta "¿hay código?" para los tests ───────────────────────────────

test('init: corre los tests si hay código en src/ aunque tests/ esté vacío', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { test: 'node -e "process.exit(3)"' },
    },
    'feature_list.json': { features: [] },
    'src/foo.txt': 'código',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1); // el comando de tests corrió y falló
  assert.match(out, /Hay tests rotos/);
});

test('init: sin código en src/ ni tests/ avisa pero no falla', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { test: 'node -e "process.exit(3)"' },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0); // el comando de tests NO corrió: nada que testear
  assert.match(out, /nada que testear/);
});

// ── init: puerta "¿hay código?" para el lint ─────────────────────────────────

test('init: NO corre el lint si src/ y tests/ están vacíos (clon limpio, avisa sin fallar)', () => {
  // Muchos linters salen distinto de 0 cuando su patrón no casa ningún fichero. El
  // comando de aquí SIEMPRE falla: si corriera, init saldría 1.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { lint: 'node -e "process.exit(1)"' },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out); // el linter NO corrió: nada que lintar
  assert.match(out, /nada que lintar/);
  assert.doesNotMatch(out, /Lint con errores/);
});

test('init: corre el lint si hay código en src/ aunque tests/ esté vacío', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { lint: 'node -e "process.exit(1)"' },
    },
    'feature_list.json': { features: [] },
    'src/foo.txt': 'código',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1); // el comando de lint corrió y falló
  assert.match(out, /Lint con errores/);
});

test('init: lint que pasa con código presente termina en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { lint: 'node -e "process.exit(0)"' },
    },
    'feature_list.json': { features: [] },
    'src/foo.txt': 'código',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Lint sin errores/);
  assert.match(out, /Entorno listo/);
});

// ── comando solo-espacios == sin comando (no falso verde) ────────────────────

test('commands.mutate solo-espacios == vacío → mutate falla con exit 2, no en falso verde', () => {
  // "   " no es un comando: sin el recorte en loadConfig, se contaría como declarado y
  // run() lo saltaría con status 0, imprimiendo "Prueba de mutación superada" sin mutador.
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: '   ' },
      mutation: { targets: ['src/x.py'] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 2);
  assert.match(out, /commands\.mutate vacío/);
  assert.doesNotMatch(out, /Prueba de mutación superada/); // no certifica sin mutador
});

test('commands.test solo-espacios == vacío → init avisa, no "Todos los tests pasan"', () => {
  // Con código en src/ para aislar que la causa del WARN es el comando en blanco.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: { test: '   ' } },
    'feature_list.json': { features: [] },
    'src/foo.txt': 'código',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /No hay comando de tests declarado/);
  assert.doesNotMatch(out, /Todos los tests pasan/); // no dice que pasan si no corrió nada
});

test('un comando real con espacios de borde se recorta y SE EJECUTA (no se salta)', () => {
  // Si corre, init falla con exit 1 (el comando sale 4); si se saltara, saldría verde.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { test: '  node -e "process.exit(4)"  ' },
    },
    'feature_list.json': { features: [] },
    'src/foo.txt': 'código',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Hay tests rotos/); // el comando real corrió y falló (no se saltó)
});

// ── test ─────────────────────────────────────────────────────────────────────

test('test: propaga el exit code del comando de tests', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', commands: { test: 'node -e "process.exit(7)"' } },
  });
  assert.equal(runEngine(dir, ['test']).status, 7);
});

test('test: commands.test vacío avisa y sale 0', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', commands: {} } });
  const { status, out } = runEngine(dir, ['test']);
  assert.equal(status, 0);
  assert.match(out, /commands\.test vacío/);
});

// ── mutate: objetivos, umbral y sustitución de tokens ────────────────────────

test('mutate: commands.mutate vacío falla con exit 2', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', commands: {} } });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 2);
  assert.match(out, /commands\.mutate vacío/);
});

test('mutate: {{target}} con `$` se inserta literal, no vía reemplazo especial', () => {
  // Con un reemplazo string, "a$$b" se colapsaba a "a$b". El motor imprime el comando
  // resuelto ("$ ...") antes de ejecutarlo: esa línea debe contener el objetivo literal.
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "console.log('ok')" {{target}}` },
      mutation: { targets: ['a$$b'] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 0, out);
  assert.match(out, /a\$\$b/);
});

test('mutate: {{py}} se resuelve al intérprete de Python disponible', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: '{{py}} --version' },
      mutation: { targets: ['x'] },
    },
  });
  const { out } = runEngine(dir, ['mutate']);
  assert.match(out, /python3?/); // 'python3' o 'python', nunca el token crudo
  assert.doesNotMatch(out, /\{\{\s*py\s*\}\}/);
});

test('mutate <target> explícito ignora la lista de la config', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "console.log('ran')" {{target}}` },
      mutation: { targets: ['AAA', 'BBB'] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate', 'CCC']);
  assert.equal(status, 0, out);
  assert.match(out, /CCC/);
  assert.doesNotMatch(out, /AAA|BBB/);
});

test('mutate: un objetivo vacío o en blanco en mutation.targets falla (exit 1) sin lanzar el mutador', () => {
  for (const bad of ['', '   ']) {
    const dir = scenario({
      'harness.config.json': {
        project: 't',
        commands: { mutate: `node -e "console.log('ran')" {{target}}` },
        mutation: { targets: ['src/a.py', bad] },
      },
    });
    const { status, out } = runEngine(dir, ['mutate']);
    assert.equal(status, 1, out);
    assert.match(out, /Objetivo de mutación vacío o en blanco/);
    assert.doesNotMatch(out, /^ran$/m); // un verde sin medir nada sería peor que el fallo
  }
});

test('mutate <target> en blanco falla (exit 1) sin lanzar el mutador', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "console.log('ran')" {{target}}` },
      mutation: { targets: ['src/a.py'] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate', '   ']);
  assert.equal(status, 1, out);
  assert.match(out, /Objetivo de mutación vacío o en blanco/);
  assert.doesNotMatch(out, /^ran$/m);
});

test('mutate: verde solo si TODOS los objetivos superan el umbral', () => {
  // El comando "pasa" (exit 0) solo cuando el objetivo es "ok".
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "process.exit(process.argv[1]==='ok'?0:1)" {{target}}` },
      mutation: { targets: ['ok', 'bad'] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 1);
  assert.match(out, /por debajo del umbral en:.*bad/);
});

test('mutate: lista vacía corre el mutador una vez sobre todo el proyecto', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: 'node -e "process.exit(0)"' },
      mutation: { targets: [] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 0, out);
  assert.match(out, /superada \(1 objetivo\)/);
});

// ── tokens {{threshold}} y {{threshold_pct}} (opt-in) ────────────────────────
// Un comando que los usa recibe el umbral de mutation.threshold en la escala que pida
// la herramienta: 0.8 → "0.8" y "80". El motor sigue sin medir nada: pasa el valor y
// propaga el exit code del comando. Los derivados que no usan los tokens no cambian.

/** Imprime los dos tokens: la salida `t=<threshold> p=<pct>` es lo que recibió el comando. */
const SHOW_TOKENS = `node -e "console.log('t=' + process.argv[1] + ' p=' + process.argv[2])" {{threshold}} {{threshold_pct}}`;

for (const [threshold, plain, pct] of [[0.8, '0.8', '80'], [1, '1', '100'], [0.75, '0.75', '75'], [0.29, '0.29', '29'], [0.575, '0.575', '58'], [0, '0', '0']]) {
  test(`tokens: mutation.threshold ${threshold} → {{threshold}}="${plain}" y {{threshold_pct}}="${pct}" (entero más próximo)`, () => {
    // 0.8 * 100 es 80.00000000000001 (ceil daría 81); 0.29 * 100 es 28.999999999999996 (floor
    // daría 28); 0.575 * 100 es 57.49999999999999 (un Math.round a secas daría 57).
    const dir = scenario({
      'harness.config.json': { project: 't', commands: { mutate: SHOW_TOKENS }, mutation: { threshold, targets: [] } },
    });
    const { status, out } = runEngine(dir, ['mutate']);
    assert.equal(status, 0, out);
    assert.match(out, new RegExp(`^t=${plain.replace('.', '\\.')} p=${pct}$`, 'm')); // lo que ejecutó
    assert.match(out, new RegExp(` ${plain.replace('.', '\\.')} ${pct}\\r?\\n`)); // el eco "$ ..." lo muestra resuelto
    assert.doesNotMatch(out, /\{\{/);
  });
}

test('tokens: sin "mutation" en la config el umbral por defecto es 0.8 (→ "0.8" y "80")', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', commands: { mutate: SHOW_TOKENS } } });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 0, out);
  assert.match(out, /^t=0\.8 p=80$/m);
});

test('tokens: un mutate que exige {{threshold_pct}} = 80 sale 0 con el umbral por defecto', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "process.exit(process.argv[1]==='80'?0:1)" {{threshold_pct}}` },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 0, out);
  assert.match(out, /Prueba de mutación superada/);
});

test('tokens: el mismo comando sale 1 si mutation.threshold es otro (el valor es el configurado)', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "process.exit(process.argv[1]==='80'?0:1)" {{threshold_pct}}` },
      mutation: { threshold: 0.5 },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 1);
  assert.match(out, /por debajo del umbral/);
});

test('tokens: admiten espacios dentro de las llaves y conviven con {{target}} (con `$` literal)', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: `node -e "console.log('ran')" {{ target }} {{ threshold }} {{ threshold_pct }}` },
      mutation: { threshold: 0.9, targets: ['a$$b'] },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 0, out);
  assert.match(out, / a\$\$b 0\.9 90\r?\n/);
});

test('tokens: también se resuelven en commands.test (bin/harness test)', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { test: `node -e "process.exit(process.argv[1]==='75'?0:1)" {{threshold_pct}}` },
      mutation: { threshold: 0.75 },
    },
  });
  const { status, out } = runEngine(dir, ['test']);
  assert.equal(status, 0, out);
});

test('tokens: init los resuelve en lint y tests, y el eco "$ ..." muestra el comando ya resuelto', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: {
        lint: `node -e "process.exit(process.argv[1]==='0.75'?0:1)" {{threshold}}`,
        test: `node -e "process.exit(process.argv[1]==='75'?0:1)" {{threshold_pct}}`,
      },
      mutation: { threshold: 0.75 },
    },
    'src/foo.txt': 'código',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Lint sin errores/);
  assert.match(out, /Todos los tests pasan/);
  assert.match(out, /\$ node .* 0\.75\r?\n/);
  assert.match(out, /\$ node .* 75\r?\n/);
});

// ── status y comando desconocido ─────────────────────────────────────────────

test('status: renderiza las features declaradas', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'saludar', status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 0);
  assert.match(out, /saludar/);
  assert.match(out, /done/);
});

test('status: lista válida vacía sigue en verde (exit 0)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 0, out);
  assert.match(out, /sin features definidas/);
});

test('status: lista con un estado inválido sale con exit 1 pero renderiza las features', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'ok', status: 'done' }, { id: 2, name: 'raro', status: 'wip' }] },
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 1);
  assert.match(out, /Estado inválido en feature 2: wip/);
  assert.match(out, /ok/); // las features se siguen mostrando para el humano
  assert.match(out, /wip\s+raro/);
});

test('comando desconocido falla con exit 2 y muestra la ayuda', () => {
  const dir = scenario(GREEN_FILES);
  const { status, out } = runEngine(dir, ['frobnicate']);
  assert.equal(status, 2);
  assert.match(out, /Comando desconocido: frobnicate/);
});

test('comando heredado del prototipo de Object (constructor) también es desconocido, no un exit 0 mudo', () => {
  const dir = scenario(GREEN_FILES);
  for (const name of ['constructor', 'toString']) {
    const { status, out } = runEngine(dir, [name]);
    assert.equal(status, 2, out);
    assert.match(out, /Comando desconocido/);
  }
});

test('verify: si init falla aborta con exit 1 y no certifica el cierre', () => {
  // standalone por defecto (true) sin los ficheros base → init falla → verify no sigue.
  const dir = scenario({
    'harness.config.json': { project: 't', commands: { test: 'node -e "process.exit(0)"', mutate: 'node -e "process.exit(0)"' } },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /verify abortado: init falló/);
  assert.doesNotMatch(out, /Puedes cerrar la sesión/);
});

// ── verify: las puertas de cierre no pueden quedar en falso verde ────────────

test('verify: require_mutation_to_close:true con commands.mutate VACÍO aborta, no en falso verde', () => {
  // Con la regla obligatoria (el default) y sin mutador declarado, verify no certifica
  // el cierre. require_tests_to_close:false aísla la puerta de mutación: sin él, la de
  // tests (default true, commands.test vacío) fallaría primero.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_tests_to_close: false, require_mutation_to_close: true },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /require_mutation_to_close es true pero commands\.mutate está vacío/);
  assert.doesNotMatch(out, /Puedes cerrar la sesión/); // no certifica el cierre
});

test('verify: require_mutation_to_close:false con commands.mutate vacío omite la puerta y sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_tests_to_close: false, require_mutation_to_close: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 0, out);
  assert.match(out, /Puedes cerrar la sesión/);
});

test('verify: require_mutation_to_close:true con mutador que pasa termina en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { mutate: 'node -e "process.exit(0)"' },
      mutation: { targets: [] },
      rules: { require_tests_to_close: false, require_mutation_to_close: true },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 0, out);
  assert.match(out, /Prueba de mutación superada/);
  assert.match(out, /Puedes cerrar la sesión/);
});

test('verify: require_mutation_to_close:true con mutador que NO supera el umbral aborta', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { mutate: 'node -e "process.exit(1)"' },
      mutation: { targets: [] },
      rules: { require_tests_to_close: false, require_mutation_to_close: true },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /no supera el umbral/);
  assert.doesNotMatch(out, /Puedes cerrar la sesión/);
});

test('verify: require_tests_to_close:true con commands.test VACÍO aborta, no en falso verde', () => {
  // `init` con commands.test vacío solo AVISA y sale 0; verify, la puerta de cierre, no
  // certifica sin suite. Se apaga la mutación para aislar la puerta de tests.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_tests_to_close: true, require_mutation_to_close: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /require_tests_to_close es true pero commands\.test está vacío/);
  assert.doesNotMatch(out, /Puedes cerrar la sesión/);
});

test('verify: require_tests_to_close:false con commands.test vacío omite la puerta y sigue en verde', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_tests_to_close: false, require_mutation_to_close: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 0, out);
  assert.match(out, /Puedes cerrar la sesión/);
});

test('verify: require_mutation_to_close:true con commands.mutate solo-espacios aborta', () => {
  // "   " se recorta a "" y toma la misma rama que el vacío.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { mutate: '   ' },
      rules: { require_tests_to_close: false, require_mutation_to_close: true },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /require_mutation_to_close es true pero commands\.mutate está vacío/);
  assert.doesNotMatch(out, /Puedes cerrar la sesión/);
});

test('verify: require_tests_to_close:true con commands.test solo-espacios aborta', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { test: '  ' },
      rules: { require_tests_to_close: true, require_mutation_to_close: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /require_tests_to_close es true pero commands\.test está vacío/);
  assert.doesNotMatch(out, /Puedes cerrar la sesión/);
});

test('verify: require_tests_to_close:true con commands.test declarado pasa la puerta y certifica', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false,
      commands: { test: 'node -e "process.exit(0)"' },
      rules: { require_tests_to_close: true, require_mutation_to_close: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 0, out);
  assert.match(out, /Puedes cerrar la sesión/);
});

// ── feature_list.json y progress/current.md: ficheros base opcionales ────────
// Son los dos únicos ficheros base que el motor no exige. Si existen, todo se
// comporta como siempre; si faltan, `init` y `status` lo dicen en un [OK] y no
// fallan. El resto de ficheros base sigue siendo obligatorio. Las aserciones
// sobre rutas usan [\\/]: el motor imprime `progress\current.md` en Windows.

const BASE_REQUIRED = ['AGENTS.md', 'CLAUDE.md', 'CHECKPOINTS.md', 'docs/workflow.md'];
/** Proyecto autónomo (standalone por defecto) con solo los ficheros base obligatorios. */
const baseFiles = (extra = {}) => ({
  'harness.config.json': { project: 't', commands: {} },
  ...Object.fromEntries(BASE_REQUIRED.map((f) => [f, '# base\n'])),
  ...extra,
});

test('init: sin feature_list.json termina en verde y avisa de que es opcional', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', standalone: false, commands: {} } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /\[OK\]\s+feature_list\.json ausente \(opcional\)/);
  assert.doesNotMatch(out, /\[FAIL\]/);
});

test('init: standalone:true sin feature_list.json ni progress/current.md termina en verde', () => {
  const dir = scenario(baseFiles());
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /Falta archivo base/);
  assert.match(out, /Opcional y ausente: feature_list\.json/);
  assert.match(out, /Opcional y ausente: progress[\\/]current\.md/);
  assert.match(out, /Entorno listo/);
});

test('init: con feature_list.json y progress/current.md presentes los comprueba y valida como siempre', () => {
  const dir = scenario(baseFiles({
    'feature_list.json': { features: [] },
    'progress/current.md': '# sesión\n',
  }));
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Existe feature_list\.json/);
  assert.match(out, /Existe progress[\\/]current\.md/);
  assert.match(out, /feature_list\.json válido \(0 features\)/);
  assert.doesNotMatch(out, /Opcional y ausente|ausente \(opcional\)/);
});

test('init: que esos dos sean opcionales no relaja el resto de ficheros base', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', commands: {} } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Falta archivo base: AGENTS\.md/);
  assert.match(out, /Falta archivo base: CLAUDE\.md/);
  assert.match(out, /Falta archivo base: CHECKPOINTS\.md/);
  assert.match(out, /Falta archivo base: docs[\\/]workflow\.md/);
  assert.doesNotMatch(out, /Falta archivo base: (feature_list|progress)/);
});

test('status: sin feature_list.json sale en verde y explica que es opcional', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', standalone: false, commands: {} } });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 0, out);
  assert.match(out, /sin feature_list\.json: es opcional/);
  assert.doesNotMatch(out, /\[FAIL\]/);
});

test('init: feature_list.json presente con JSON inválido sigue fallando (opcional no es tolerante)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': '{ "features": [',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /feature_list\.json inválido/);
  assert.doesNotMatch(out, /ausente/);
});

test('init: paths.feature_list y paths.progress personalizados y ausentes también son opcionales', () => {
  const dir = scenario(baseFiles({
    'harness.config.json': {
      project: 't', commands: {},
      paths: { feature_list: 'tareas/lista.json', progress: 'seguimiento' },
    },
  }));
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Opcional y ausente: tareas[\\/]lista\.json/);
  assert.match(out, /Opcional y ausente: seguimiento[\\/]current\.md/);
  assert.match(out, /tareas[\\/]lista\.json ausente \(opcional\)/);
});

test('verify: sin feature_list.json ni progress/current.md certifica el cierre igual', () => {
  const dir = scenario(baseFiles({
    'harness.config.json': {
      project: 't',
      commands: { test: 'node -e "process.exit(0)"' },
      rules: { require_tests_to_close: true, require_mutation_to_close: false },
    },
  }));
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 0, out);
  assert.match(out, /Puedes cerrar la sesión/);
});

// ── red de seguridad: un fichero mal formado termina en [FAIL], no en una traza ──
// El motor no valida la forma de lo que lee. Cualquier excepción inesperada la recoge
// el despacho y la convierte en un mensaje de una línea con exit 2.

test('un harness.config.json mal formado termina en [FAIL] con exit 2 y sin traza', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: { test: 5 } },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /\[FAIL\]\s+Error inesperado: .*harness\.config\.json o feature_list\.json mal formado/);
  assert.doesNotMatch(out, /\n\s+at /); // sin traza de pila
});

test('un feature_list.json mal formado termina en [FAIL] con exit 2 y sin traza', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': 'null',
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 2);
  assert.match(out, /\[FAIL\]\s+Error inesperado/);
  assert.doesNotMatch(out, /\n\s+at /);
});
