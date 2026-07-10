#!/usr/bin/env node
// harness.mjs — Motor AGNÓSTICO del arnés SSD "Uncle Bob".
//
// No sabe de tu lenguaje: lee `harness.config.json` del directorio actual y
// ejecuta los comandos que TÚ declaras (test, mutación, lint...). Así el mismo
// motor sirve para Python, Node/TS, Go o cualquier stack.
//
//   node .harness/harness.mjs <comando>
//
// Comandos:
//   init     Verifica entorno, ficheros base, feature_list.json y corre los tests.
//   test     Ejecuta el comando de tests declarado en config.commands.test.
//   mutate   Ejecuta la prueba de mutación (config.commands.mutate).
//   verify   init + lint + mutate: la verificación completa (puerta de cierre).
//   status   Resume el estado de feature_list.json.
//   help     Muestra esta ayuda.
//
// Requisito único del arnés: Node.js >= 18 (sin dependencias npm; solo stdlib).
// Los comandos admiten el token {{py}}, que el motor resuelve al intérprete de
// Python disponible (python3 o python). Ejecuta el motor desde la raíz de un
// proyecto que contenga `harness.config.json`.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const NC = process.env.NO_COLOR ? '' : '\x1b[0m';
const C = (code) => (process.env.NO_COLOR ? '' : `\x1b[${code}m`);
const green = (s) => `${C('0;32')}${s}${NC}`;
const red = (s) => `${C('0;31')}${s}${NC}`;
const yellow = (s) => `${C('0;33')}${s}${NC}`;
const bold = (s) => `${C('1')}${s}${NC}`;

const ok = (s) => console.log(`${green('[OK]')}    ${s}`);
const warn = (s) => console.log(`${yellow('[WARN]')}  ${s}`);
const fail = (s) => console.log(`${red('[FAIL]')}  ${s}`);
const rule = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 52 - s.length))}`);

const CWD = process.cwd();
const CONFIG_NAME = 'harness.config.json';

const VALID_STATUS = ['pending', 'spec_ready', 'in_progress', 'done', 'blocked'];
const REQUIRES_SPEC = new Set(['spec_ready', 'in_progress', 'done']);

let _py = null;
/** Resuelve el intérprete de Python disponible (para el token {{py}}). */
function resolvePython() {
  if (_py !== null) return _py;
  for (const cand of ['python3', 'python']) {
    const r = spawnSync(cand, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return (_py = cand);
  }
  return (_py = 'python3'); // por defecto; fallará con mensaje claro si no existe
}

/** Sustituye tokens en un comando ({{py}} → intérprete, {{target}} → objetivo). */
function resolveCmd(cmd, tokens = {}) {
  if (!cmd) return cmd;
  return cmd
    .replace(/\{\{\s*py\s*\}\}/g, resolvePython())
    .replace(/\{\{\s*target\s*\}\}/g, tokens.target || '');
}

/** Carga y valida harness.config.json con valores por defecto sensatos. */
function loadConfig() {
  const p = path.join(CWD, CONFIG_NAME);
  if (!fs.existsSync(p)) {
    fail(`No se encontró ${CONFIG_NAME} en ${CWD}`);
    console.log(
      `\nEjecuta el motor desde la raíz de un proyecto que contenga ${CONFIG_NAME}.\n` +
      `Copia la plantilla de la raíz del template y declara los comandos de tu stack.`,
    );
    process.exit(2);
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${CONFIG_NAME} no es JSON válido: ${e.message}`);
    process.exit(2);
  }
  cfg.paths = Object.assign(
    {
      src: 'src', tests: 'tests', features: 'features', progress: 'progress',
      spec: 'project-spec.md', feature_list: 'feature_list.json',
    },
    cfg.paths || {},
  );
  cfg.commands = Object.assign(
    { install: '', test: '', mutate: '', lint: '', build: '' },
    cfg.commands || {},
  );
  cfg.mutation = Object.assign({ threshold: 0.8, targets: [] }, cfg.mutation || {});
  if (typeof cfg.standalone !== 'boolean') cfg.standalone = true;
  cfg.rules = Object.assign(
    {
      one_feature_at_a_time: true,
      require_approved_spec_to_implement: true,
      require_tests_to_close: true,
      require_mutation_to_close: true,
    },
    cfg.rules || {},
  );
  return cfg;
}

/** Ejecuta un comando de shell; devuelve {status, stdout, stderr}. */
function run(cmd, { capture = false, tokens = {} } = {}) {
  const resolved = resolveCmd(cmd, tokens);
  if (!resolved || !resolved.trim()) return { status: 0, stdout: '', stderr: '', skipped: true };
  const res = spawnSync(resolved, {
    cwd: CWD, shell: true, encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '', skipped: false };
}

function dirHasFiles(dir) {
  const p = path.join(CWD, dir);
  if (!fs.existsSync(p)) return false;
  try {
    return fs.readdirSync(p).some((f) => !f.startsWith('.') && f !== '.gitkeep' && f !== '__init__.py');
  } catch {
    return false;
  }
}

/** Valida feature_list.json y devuelve {ok, features}. */
function validateFeatureList(cfg) {
  const p = path.join(CWD, cfg.paths.feature_list);
  if (!fs.existsSync(p)) {
    fail(`Falta ${cfg.paths.feature_list}`);
    return { ok: false, features: [] };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${cfg.paths.feature_list} inválido: ${e.message}`);
    return { ok: false, features: [] };
  }

  const features = data.features || [];
  let good = true;

  const inProgress = features.filter((f) => f.status === 'in_progress');
  if (cfg.rules.one_feature_at_a_time && inProgress.length > 1) {
    fail(`Hay ${inProgress.length} features en in_progress (máximo 1)`);
    good = false;
  }
  for (const f of features) {
    if (!VALID_STATUS.includes(f.status)) {
      fail(`Estado inválido en feature ${f.id}: ${f.status}`);
      good = false;
    }
    if (f.sdd && REQUIRES_SPEC.has(f.status)) {
      const feat = path.join(CWD, cfg.paths.features, `${f.name}.feature`);
      if (!fs.existsSync(feat)) {
        fail(`feature ${f.id} (${f.name}) en ${f.status} sin ${cfg.paths.features}/${f.name}.feature`);
        good = false;
      }
    }
  }
  if (good) ok(`${cfg.paths.feature_list} válido (${features.length} features)`);
  return { ok: good, features };
}

function cmdInit() {
  const cfg = loadConfig();
  let exit = 0;

  rule('1. Entorno');
  ok(`node -> ${process.version}`);
  const [maj] = process.versions.node.split('.').map(Number);
  if (maj < 18) {
    fail('Se requiere Node.js >= 18');
    process.exit(1);
  }
  ok('Versión de Node compatible');

  rule('2. Ficheros base del arnés');
  if (cfg.standalone === false) {
    warn('standalone:false — este proyecto hereda el arnés raíz; se omite la comprobación de ficheros base.');
  } else {
    const base = [
      'AGENTS.md', 'CLAUDE.md', 'CHECKPOINTS.md', 'docs/workflow.md',
      cfg.paths.feature_list, path.join(cfg.paths.progress, 'current.md'),
    ];
    for (const f of base) {
      if (fs.existsSync(path.join(CWD, f))) ok(`Existe ${f}`);
      else {
        fail(`Falta archivo base: ${f}`);
        exit = 1;
      }
    }
  }

  rule('3. feature_list.json y escenarios');
  if (!validateFeatureList(cfg).ok) exit = 1;

  if (cfg.commands.lint) {
    rule('4. Lint');
    console.log(`$ ${resolveCmd(cfg.commands.lint)}\n`);
    const r = run(cfg.commands.lint);
    if (r.status === 0) ok('Lint sin errores');
    else {
      fail('Lint con errores');
      exit = 1;
    }
  }

  rule(cfg.commands.lint ? '5. Tests' : '4. Tests');
  if (!cfg.commands.test) {
    warn('No hay comando de tests declarado (commands.test vacío)');
  } else if (!dirHasFiles(cfg.paths.tests)) {
    warn(`Carpeta ${cfg.paths.tests}/ vacía o inexistente todavía`);
  } else {
    console.log(`$ ${resolveCmd(cfg.commands.test)}\n`);
    const r = run(cfg.commands.test);
    if (r.status === 0) ok('Todos los tests pasan');
    else {
      fail('Hay tests rotos');
      exit = 1;
    }
  }

  rule('Resumen');
  if (exit === 0) ok('Entorno listo. Puedes empezar a trabajar.');
  else fail('Entorno NO está listo. Resuelve los errores antes de avanzar.');
  process.exit(exit);
}

function cmdTest() {
  const cfg = loadConfig();
  if (!cfg.commands.test) {
    warn('commands.test vacío');
    process.exit(0);
  }
  process.exit(run(cfg.commands.test).status);
}

function cmdMutate() {
  const cfg = loadConfig();
  if (!cfg.commands.mutate) {
    fail('commands.mutate vacío: declara la prueba de mutación en harness.config.json');
    process.exit(2);
  }
  const target = process.argv[3] || '';
  console.log(`$ ${resolveCmd(cfg.commands.mutate, { target })}\n`);
  process.exit(run(cfg.commands.mutate, { tokens: { target } }).status);
}

function cmdVerify() {
  const initRes = spawnSync(process.execPath, [__filename, 'init'], { cwd: CWD, stdio: 'inherit' });
  if ((initRes.status ?? 1) !== 0) {
    fail('verify abortado: init falló.');
    process.exit(1);
  }
  const cfg = loadConfig();
  if (cfg.rules.require_mutation_to_close && cfg.commands.mutate) {
    rule('Prueba de mutación');
    console.log(`$ ${resolveCmd(cfg.commands.mutate)}\n`);
    const r = run(cfg.commands.mutate);
    if (r.status !== 0) {
      fail('La prueba de mutación no supera el umbral.');
      process.exit(1);
    }
    ok('Prueba de mutación superada.');
  }
  console.log(`\n${green(bold('[verify] Todo verde. Puedes cerrar la sesión.'))}`);
  process.exit(0);
}

function cmdStatus() {
  const cfg = loadConfig();
  const v = validateFeatureList(cfg);
  rule('Estado de features');
  if (!v.features.length) {
    console.log('  (sin features definidas todavía)');
    process.exit(0);
  }
  for (const f of v.features) {
    const tag = { done: green, in_progress: yellow, blocked: red }[f.status] || ((s) => s);
    console.log(`  #${String(f.id).padStart(2)} ${tag(f.status.padEnd(12))} ${f.name}${f.sdd ? ' (sdd)' : ''}`);
  }
  process.exit(0);
}

function help() {
  console.log(`${bold('Arnés SSD "Uncle Bob" — motor agnóstico')}

  node .harness/harness.mjs <comando>

  ${bold('init')}     Verifica entorno, ficheros base, feature_list.json, lint y tests.
  ${bold('test')}     Ejecuta config.commands.test.
  ${bold('mutate')}   Ejecuta la prueba de mutación (config.commands.mutate [target]).
  ${bold('verify')}   init + mutación (puerta de cierre de sesión).
  ${bold('status')}   Resume feature_list.json.
  ${bold('help')}     Esta ayuda.

  Configuración: ${CONFIG_NAME} (declara paths, commands, mutation, rules).
  Token {{py}} en commands → se resuelve a python3/python disponible.`);
}

const cmd = (process.argv[2] || 'help').toLowerCase();
({
  init: cmdInit, test: cmdTest, mutate: cmdMutate, verify: cmdVerify, status: cmdStatus, help,
}[cmd] || (() => {
  fail(`Comando desconocido: ${cmd}`);
  help();
  process.exit(2);
}))();
