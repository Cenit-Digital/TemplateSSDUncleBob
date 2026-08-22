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

test('loadConfig: flag de "rules" no-booleano (string "false") falla legible, no en coerción muda', () => {
  // Entrecomillar un booleano en JSON ("require_mutation_to_close": "false") es el
  // mismo error de mano que #26 cerró para `standalone`, pero en un flag anidado en
  // `rules`. El string "false" es TRUTHY, así que la regla que el usuario quería
  // DESACTIVAR seguía activa y `verify` abortaba imprimiendo "require_mutation_to_close
  // es true..." —contradiciendo lo que el usuario escribió—. Debe ser un [FAIL] que
  // nombre la regla y su tipo, no una coerción silenciosa.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_mutation_to_close: 'false' },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"rules\.require_mutation_to_close" debe ser true o false \(encontrado: string\)/);
});

test('loadConfig: flag de "rules" numérico falla legible con su tipo', () => {
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { one_feature_at_a_time: 0 },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"rules\.one_feature_at_a_time" debe ser true o false \(encontrado: number\)/);
});

test('loadConfig: flag de "rules" no-booleano NO cae en el síntoma downstream (verify no contradice)', () => {
  // Con el bug antiguo, "require_mutation_to_close": "false" (truthy) hacía que
  // verify abortara diciendo "require_mutation_to_close es true": un mensaje que
  // contradice lo escrito. El guardián corta antes, ya en la fase init de verify
  // (que corre init como subproceso y aborta con exit 1 si falla), con la causa real.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      rules: { require_mutation_to_close: 'false' },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 1);
  assert.match(out, /"rules\.require_mutation_to_close" debe ser true o false/);
  assert.doesNotMatch(out, /es true pero commands\.mutate/); // no desorienta con el síntoma
});

test('loadConfig: flags de "rules" booleanos legítimos siguen en verde (sin falso positivo)', () => {
  // El guardián no debe rechazar los valores booleanos legítimos: false explícito
  // para relajar una regla, o una config parcial que hereda los defaults del resto.
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

// ── loadConfig: standalone booleano ──────────────────────────────────────────

test('loadConfig: "standalone" no-booleano (string "false") falla legible, no en coerción muda', () => {
  // Entrecomillar un booleano en JSON ("standalone": "false") es el error de mano
  // clásico. Antes se coercía EN SILENCIO a true: el sub-proyecto que el usuario
  // quería marcar como heredero del arnés raíz (standalone:false) acababa
  // comprobando ficheros base ausentes y fallaba con "Falta archivo base" —un
  // mensaje que apunta al síntoma, no a la causa—. Debe ser un [FAIL] legible que
  // nombre `standalone`, como sus hermanos commands/paths/mutation/rules.
  const dir = scenario({ 'harness.config.json': { project: 't', standalone: 'false', commands: {} } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"standalone" debe ser true o false/);
  assert.doesNotMatch(out, /Falta archivo base/); // no desorienta con el síntoma
});

test('loadConfig: "standalone" numérico falla legible con su tipo', () => {
  const dir = scenario({ 'harness.config.json': { project: 't', standalone: 0, commands: {} } });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 2);
  assert.match(out, /"standalone" debe ser true o false \(encontrado: number\)/);
});

test('loadConfig: "standalone" ausente asume autónomo (comprueba ficheros base)', () => {
  // Omitir standalone es válido: el motor asume true. Sin ficheros base, init falla
  // por su ausencia (no por el campo), demostrando que el default sigue en pie.
  const dir = scenario({
    'harness.config.json': { project: 't', commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /Falta archivo base/);
  assert.doesNotMatch(out, /"standalone" debe ser/); // el campo ausente no es un error
});

test('loadConfig: "standalone" false legítimo omite los ficheros base y sigue en verde', () => {
  // El guardián no debe rechazar el valor legítimo que toda la suite usa para
  // heredar el arnés raíz.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /hereda el arnés raíz/);
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

// ── feature_list: feature sdd sin name usable deriva features/<name>.feature ──

test('feature_list: feature sdd en estado con-spec SIN name culpa al name, no a un fichero fantasma', () => {
  // Una feature sdd en un estado que exige spec (spec_ready/in_progress/done)
  // DERIVA features/<name>.feature de su name. Sin name, el motor derivaba
  // features/undefined.feature y fallaba con "sin features/undefined.feature": un
  // mensaje que manda a crear un fichero fantasma en vez de a la causa (falta el
  // name). Debe nombrar el name como la causa.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, sdd: true, status: 'in_progress' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /feature 1 \(sdd\) en in_progress necesita un "name"/);
  assert.doesNotMatch(out, /undefined\.feature/); // no manda a un fichero fantasma
});

test('feature_list: feature sdd con name en blanco reporta el name UNA vez, sin doble [FAIL]', () => {
  // Un name present-pero-en-blanco lo reporta el guardián de name (#24). La rama
  // sdd NO debe añadir un segundo [FAIL] sobre features/   .feature (doble ruido
  // por el mismo error): con la derivación guardada, solo queda el mensaje de name.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 7, name: '   ', sdd: true, status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /"name" de la feature 7 debe ser un string no vacío/);
  assert.doesNotMatch(out, /sin features\/.*\.feature/); // sin el segundo [FAIL] derivado
});

test('feature_list: feature sdd en PENDING sin name no exige spec (no la toca esta puerta)', () => {
  // REQUIRES_SPEC excluye pending/blocked: una feature sdd aún en pending no deriva
  // .feature todavía, así que un name ausente aquí no es un error de ESTA puerta
  // (el name se exigirá al pasar a spec_ready). Sin falso positivo.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, sdd: true, status: 'pending' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /necesita un "name"/);
});

test('feature_list: feature sdd con name válido pero SIN su .feature sigue fallando por el fichero', () => {
  // El guardián de name no debe tapar el chequeo real: con un name usable y sin el
  // features/<name>.feature correspondiente, la puerta sigue exigiendo el contrato.
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_since', sdd: true, status: 'done' }] },
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 1);
  assert.match(out, /feature 1 \(cli_since\) en done sin features\/cli_since\.feature/);
});

test('feature_list: feature sdd con name válido y su .feature presente termina en verde', () => {
  const dir = scenario({
    'harness.config.json': { project: 't', standalone: false, commands: {} },
    'feature_list.json': { features: [{ id: 1, name: 'cli_since', sdd: true, status: 'done' }] },
    'features/cli_since.feature': 'Feature: since\n',
  });
  const { status, out } = runEngine(dir, ['init']);
  assert.equal(status, 0, out);
  assert.match(out, /Entorno listo/);
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

// ── init: gate de lint sobre árbol vacío (simétrico al de tests, #19) ────────

test('init: NO corre el lint si src/ y tests/ están vacíos (clon limpio, avisa sin fallar)', () => {
  // Simétrico al gate de tests (#19): un clon recién hecho trae src/ y tests/
  // vacíos; correr el linter ahí no tiene sentido y muchos linters salen NO-CERO
  // cuando su patrón no casa nada, rompiendo `init` en la primera experiencia
  // (límite 5 de AUTONOMOUS.md). El comando de lint aquí SIEMPRE falla: si corriera,
  // init saldría 1. Debe SALTARSE con un WARN y quedarse en verde.
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
  // Con código presente el gate deja pasar y un fallo real de lint sigue siendo
  // [FAIL]: el gate no debilita la puerta (límite 2), solo evita el árbol vacío.
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

// ── verify: la puerta de mutación obligatoria no puede quedar en falso verde ──

test('verify: require_mutation_to_close:true con commands.mutate VACÍO aborta, no en falso verde', () => {
  // verify es la puerta de cierre de sesión (docs/verification.md: "Si verify está
  // rojo... no marques nada como done"). Con la regla obligatoria activa (el
  // DEFAULT) y sin mutador declarado, la puerta se OMITÍA en silencio y aún así
  // imprimía "Todo verde. Puedes cerrar la sesión": un falso verde sobre la puerta
  // de cierre (límite 2). El `mutate` directo ya falla ante commands.mutate vacío;
  // verify —la misma puerta a nivel de sesión— debe fallar igual, nombrando la causa.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      // require_tests_to_close:false aísla la puerta de mutación: sin él, el
      // guardián hermano de tests (default true, commands.test vacío) fallaría
      // primero y taparía la conducta de mutación que este caso fija.
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
  // Opt-out legítimo: si el proyecto declara que no cierra por mutación, verify no
  // debe exigir un mutador. El guardián nuevo no puede romper este caso.
  const dir = scenario({
    'harness.config.json': {
      project: 't', standalone: false, commands: {},
      // Ambas puertas opt-out: este caso fija SOLO que verify no exige mutador.
      rules: { require_tests_to_close: false, require_mutation_to_close: false },
    },
    'feature_list.json': { features: [] },
  });
  const { status, out } = runEngine(dir, ['verify']);
  assert.equal(status, 0, out);
  assert.match(out, /Puedes cerrar la sesión/);
});

test('verify: require_mutation_to_close:true con mutador que pasa termina en verde', () => {
  // Con un mutador declarado que supera el umbral, la puerta corre de verdad y
  // verify certifica el cierre: el guardián no debilita la puerta (límite 2).
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
  // La puerta corre y falla: verify no certifica el cierre. Comprobación de que la
  // rama del guardián (mutate vacío) no tapa la rama real (mutate presente que falla).
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

// ── verify: la puerta de tests obligatoria no puede quedar en falso verde ─────

test('verify: require_tests_to_close:true con commands.test VACÍO aborta, no en falso verde', () => {
  // Hermano simétrico del guardián de mutación (#29). `init` corre los tests pero
  // con commands.test vacío solo AVISA y sale 0; verify aún certificaba "Puedes
  // cerrar la sesión" pese a require_tests_to_close:true (el DEFAULT): un falso
  // verde sobre la puerta de cierre (límite 2 de AUTONOMOUS.md). Era, además, la
  // única de las cuatro reglas que el motor declaraba pero NO enforzaba. Aquí se
  // apaga la mutación para AISLAR la puerta de tests como la causa del abort.
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
  assert.doesNotMatch(out, /Puedes cerrar la sesión/); // no certifica el cierre
});

test('verify: require_tests_to_close:false con commands.test vacío omite la puerta y sigue en verde', () => {
  // Opt-out legítimo: si el proyecto declara que no cierra por tests, verify no
  // debe exigir un comando de tests. El guardián nuevo no puede romper este caso.
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

test('verify: require_tests_to_close:true con commands.test declarado pasa la puerta y certifica', () => {
  // Con un comando de tests declarado, la puerta de tests se satisface e `init` ya
  // los corrió (o los avisó si no hay código); verify llega al verde. El guardián
  // no debilita la puerta (límite 2): solo exige que exista el comando. Se apaga la
  // mutación para que el único filtro relevante aquí sea la puerta de tests.
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
