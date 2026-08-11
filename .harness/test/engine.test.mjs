// engine.test.mjs — Tests de caracterización y regresión del motor del arnés.
//
// El motor `.harness/harness.mjs` es TODA la cadena de verificación de la
// plantilla (init / test / mutate / verify) y ha acumulado ~10 PRs de
// endurecimiento (guardianes de forma de config, tolerancia a BOM, forma de
// mutation.targets, forma de las entradas de features, token {{target}} con `$`
// literal, gate de tests-en-src). Hasta ahora no tenía NINGÚN test propio: una
// laguna real en un repo cuya tesis entera es TDD + mutación. Cada caso de aquí
// fija una de esas conductas contra futuras regresiones y cita el PR que la
// introdujo.
//
// Sin dependencias npm: usa `node:test` (estable desde Node 18, el único
// requisito del arnés). Se corre con la RUTA DE FICHERO explícita:
//
//   node --test .harness/test/engine.test.mjs
//
// (no `node --test .harness/test/`: en Node 22 la forma de directorio intenta
// cargar la carpeta como módulo y revienta con MODULE_NOT_FOUND; la ruta de
// fichero explícita funciona en Node 18+, el mínimo del arnés). El job
// `engine-tests` recomendado en docs/verification.md corre este mismo comando.
//
// El motor llama a `process.exit()` y escribe con console.log, así que cada caso
// lo lanza como SUBPROCESO en un directorio temporal y comprueba el código de
// salida y la salida combinada (stdout+stderr). NO_COLOR=1 evita códigos ANSI.

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

test('init: config que no es objeto JSON falla con exit 2', () => {
  const dir = scenario({ 'harness.config.json': '[]' });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /debe ser un objeto JSON/);
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

// ── loadConfig: guardianes de forma (PRs #12, #15, #16, #18) ─────────────────

test('loadConfig: "commands" no-objeto falla legible, no en falso verde (#18)', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', commands: 'go test' } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"commands" debe ser un objeto/);
});

test('loadConfig: valor de "paths" no-string falla legible (#15)', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', paths: { src: 5 } } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"paths\.src" debe ser un string/);
});

test('loadConfig: "mutation" no-objeto falla legible (#16)', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', mutation: 'src/x.py' } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"mutation" debe ser un objeto/);
});

test('loadConfig: "rules" no-objeto falla legible, no en descarte mudo', () => {
  // `rules` es el último de los cuatro contenedores "type": "object" del schema
  // (commands, paths, mutation, rules) que faltaba por guardar. Un string se
  // tragaba en silencio (Object.assign deja los defaults en pie) y salía verde sin
  // avisar de que la config de reglas se ignoró. Debe ser un [FAIL] como sus
  // hermanos (#16, #18), no un descarte mudo.
  const dir = scenario({ 'harness.config.json': { project: 't', rules: 'estrictas' } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"rules" debe ser un objeto/);
});

test('loadConfig: "rules" objeto válido sigue en verde (sin falso positivo)', () => {
  // El guardián de contenedor no debe rechazar una config de reglas legítima.
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

test('loadConfig: tolera BOM UTF-8 al parsear config (#11)', () => {
  const raw = '﻿' + json({ project: 't', standalone: false, commands: {} });
  const dir = scenario({ 'harness.config.json': raw, 'feature_list.json': { features: [] } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
});

// ── feature_list: forma (PRs #12, #13) ───────────────────────────────────────

test('feature_list: "features" no-array falla legible (#12)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: {} },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /"features" debe ser un array/);
});

test('feature_list: entrada no-objeto falla legible, sin stack trace (#13)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [42] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /features\[0\] debe ser un objeto/);
});

// ── feature_list: unicidad de id/name ────────────────────────────────────────

test('feature_list: id duplicado falla legible, no en falso "válido"', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 'a', status: 'done' },
        { id: 1, name: 'b', status: 'done' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /id duplicado en features: 1/);
});

test('feature_list: name duplicado falla (colisiona su features/<name>.feature)', () => {
  // Dos features con el mismo name comparten el mismo .feature: el gate de
  // aprobación humana de una tapa a la otra. Debe ser un [FAIL], no un verde.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 'cli_add', status: 'pending' },
        { id: 2, name: 'cli_add', status: 'pending' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /name duplicado en features: "cli_add"/);
});

test('feature_list: id "1" (string) y 1 (número) colisionan como la misma feature', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 'a', status: 'done' },
        { id: '1', name: 'b', status: 'done' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /id duplicado en features: 1/);
});

test('feature_list: ids y names únicos siguen en verde (sin falso positivo)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 'a', status: 'done' },
        { id: 2, name: 'b', status: 'pending' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /válido \(2 features\)/);
});

// ── feature_list: name debe ser un string no vacío ───────────────────────────

test('feature_list: name numérico duplicado falla, no en falso verde (deriva el mismo .feature)', () => {
  // Regresión del hueco del guardián de unicidad (#22): filtra typeof name ===
  // 'string', así que dos names numéricos 123 (olvidar las comillas) lo ESQUIVABAN
  // y pasaban como "válido" en verde pese a colisionar en features/123.feature.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': {
      features: [
        { id: 1, name: 123, status: 'done' },
        { id: 2, name: 123, status: 'done' },
      ],
    },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /"name" de la feature .* debe ser un string no vacío/);
  assert.doesNotMatch(out, /feature_list\.json válido/);
});

test('feature_list: name no-string (boolean) falla legible, sin stack trace', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: true, status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /"name" de la feature 1 debe ser un string no vacío \(encontrado: boolean\)/);
});

test('feature_list: name vacío falla (derivaría features/.feature)', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: '   ', status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /"name" de la feature 1 debe ser un string no vacío \(encontrado: string vacío\)/);
});

// ── init: gate tests-en-src (#19) ────────────────────────────────────────────

test('init: corre los tests si hay código en src/ aunque tests/ esté vacío (#19)', () => {
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

test('init: sin código en src/ ni tests/ avisa pero no falla (#19)', () => {
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

// ── mutate: objetivos, umbral y sustitución de tokens ────────────────────────

test('mutate: commands.mutate vacío falla con exit 2', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', commands: {} } });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 2);
  assert.match(out, /commands\.mutate vacío/);
});

test('mutate: "mutation.targets" no-array falla legible, no en falso verde (#14)', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't',
      commands: { mutate: 'node -e "process.exit(0)" {{target}}' },
      mutation: { targets: 'src/x.py' },
    },
  });
  const { status, out } = runEngine(dir, ['mutate']);
  assert.equal(status, 1);
  assert.match(out, /"mutation\.targets" debe ser un array/);
});

test('mutate: {{target}} con `$` se inserta literal, no vía reemplazo especial (#17)', () => {
  // Con el bug antiguo (String.replace con valor string), "a$$b" se colapsaba a
  // "a$b". El motor imprime el comando resuelto ("$ ...") antes de ejecutarlo:
  // esa línea, pura cadena JS sin shell, debe contener el objetivo literal.
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

test('status: lista válida vacía sigue en verde (exit 0) sin falso positivo', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 0, out);
  assert.match(out, /sin features definidas/);
});

test('status: feature_list corrupto (features no-array) sale con exit 1, no en falso verde', () => {
  // validateFeatureList imprime su [FAIL], pero cmdStatus descartaba v.ok y salía
  // 0: un falso verde de la misma familia que el resto de guardianes (límite 2).
  // Además NO debe decir "sin features definidas": la lista no está vacía, está
  // corrupta.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: 42 },
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 1);
  assert.match(out, /"features" debe ser un array/);
  assert.doesNotMatch(out, /sin features definidas/);
});

test('status: entrada corrupta mezclada con una válida sale con exit 1 pero renderiza la válida', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'ok', status: 'done' }, 99] },
  });
  const { status, out } = runEngine(dir, ['status']);
  assert.equal(status, 1);
  assert.match(out, /features\[1\] debe ser un objeto/);
  assert.match(out, /ok/); // la entrada válida se sigue mostrando para el humano
});

test('comando desconocido falla con exit 2 y muestra la ayuda', () => {
  const dir = scenario(GREEN_FILES);
  const { status, out } = runEngine(dir, ['frobnicate']);
  assert.equal(status, 2);
  assert.match(out, /Comando desconocido: frobnicate/);
});
