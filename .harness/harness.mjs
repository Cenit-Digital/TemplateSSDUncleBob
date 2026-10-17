#!/usr/bin/env node
// harness.mjs — Motor AGNÓSTICO del arnés SSD "Uncle Bob".
//
// No sabe de tu lenguaje: lee `harness.config.json` del directorio actual y ejecuta
// los comandos que TÚ declaras (test, mutación, lint...). Así el mismo motor sirve
// para Python, Node/TS, Go o cualquier stack.
//
//   node .harness/harness.mjs <init|test|mutate [target]|verify|status|help>
//
// Requisito único: Node.js >= 18 (solo stdlib). Los comandos admiten los tokens {{py}}
// (python3 o python, el que haya), {{target}} (el módulo a mutar) y {{threshold}} /
// {{threshold_pct}} (el umbral de mutación, 0.8 u 80). Ejecútalo desde la raíz de un
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

// Los editores de Windows guardan JSON con BOM y JSON.parse no lo tolera.
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const readText = (p) => stripBom(fs.readFileSync(p, 'utf8'));

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

/**
 * Sustituye tokens en un comando: {{py}} → intérprete de Python, {{target}} → objetivo,
 * {{threshold}} → umbral de mutación (0.8), {{threshold_pct}} → ese umbral en % (80).
 */
function resolveCmd(cmd, tokens = {}) {
  if (!cmd) return cmd;
  // Reemplazo por FUNCIÓN: con un string, un `$` en la ruta (`a$&b`) se interpretaría.
  return cmd.replace(/\{\{\s*(py|target|threshold_pct|threshold)\s*\}\}/g, (_, k) => (k === 'py' ? resolvePython() : tokens[k] ?? ''));
}

/** Carga harness.config.json y le aplica los valores por defecto. */
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
    cfg = JSON.parse(readText(p));
  } catch (e) {
    fail(`${CONFIG_NAME} no es JSON válido: ${e.message}`);
    process.exit(2);
  }
  cfg.paths = Object.assign(
    {
      src: 'src', tests: 'tests', features: 'features', progress: 'progress',
      spec: 'project-spec.md', feature_list: 'feature_list.json',
    },
    cfg.paths,
  );
  cfg.commands = Object.assign({ install: '', test: '', mutate: '', lint: '', build: '' }, cfg.commands);
  // Un comando solo-espacios es la AUSENCIA de comando: sin el trim, "   " cuenta como
  // declarado en los `if (cfg.commands.X)` pero run() lo salta con status 0 (falso verde).
  for (const key of Object.keys(cfg.commands)) {
    cfg.commands[key] = cfg.commands[key].trim();
  }
  cfg.mutation = Object.assign({ threshold: 0.8, targets: [] }, cfg.mutation);
  // Tokens de todos los comandos. Math.round, no ceil: 0.8 * 100 es 80.00000000000001.
  cfg.tokens = { threshold: String(cfg.mutation.threshold), threshold_pct: String(Math.round(cfg.mutation.threshold * 100)) };
  cfg.standalone ??= true;
  cfg.rules = Object.assign(
    {
      one_feature_at_a_time: true,
      require_approved_spec_to_implement: true,
      require_tests_to_close: true,
      require_mutation_to_close: true,
    },
    cfg.rules,
  );
  return cfg;
}

/** Ejecuta un comando de shell y devuelve su código de salida (0 si está vacío). */
function run(cmd, tokens = {}) {
  const resolved = resolveCmd(cmd, tokens);
  if (!resolved || !resolved.trim()) return 0;
  const res = spawnSync(resolved, { cwd: CWD, shell: true, encoding: 'utf8', stdio: 'inherit' });
  return res.status ?? 1;
}

/** Imprime `$ comando` (ya resuelto) y lo ejecuta; devuelve su código de salida. */
function runEcho(cmd, tokens) {
  console.log(`$ ${resolveCmd(cmd, tokens)}\n`);
  return run(cmd, tokens);
}

function dirHasFiles(dir) {
  try {
    return fs.readdirSync(path.join(CWD, dir)).some((f) => !f.startsWith('.') && f !== '__init__.py');
  } catch {
    return false; // la carpeta no existe
  }
}

/**
 * Valida feature_list.json y devuelve {ok, features, absent?}. El fichero es
 * OPCIONAL: si no existe no hay nada que validar; si existe, se valida entero.
 */
function validateFeatureList(cfg) {
  const p = path.join(CWD, cfg.paths.feature_list);
  if (!fs.existsSync(p)) {
    ok(`${cfg.paths.feature_list} ausente (opcional): se omite la validación de features`);
    return { ok: true, features: [], absent: true };
  }
  let data;
  try {
    data = JSON.parse(readText(p));
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
    // Un `.feature` por feature sdd es la enforcement mecánica de
    // `require_approved_spec_to_implement`: el humano aprueba ese contrato antes de implementar.
    if (cfg.rules.require_approved_spec_to_implement && f.sdd === true && REQUIRES_SPEC.has(f.status)) {
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
    // [ruta, opcional]: si un opcional falta, se avisa sin fallar.
    const base = [
      ['AGENTS.md', false], ['CLAUDE.md', false], ['CHECKPOINTS.md', false], ['docs/workflow.md', false],
      [cfg.paths.feature_list, true], [path.join(cfg.paths.progress, 'current.md'), true],
    ];
    for (const [f, optional] of base) {
      if (fs.existsSync(path.join(CWD, f))) ok(`Existe ${f}`);
      else if (optional) ok(`Opcional y ausente: ${f} (se omite)`);
      else {
        fail(`Falta archivo base: ${f}`);
        exit = 1;
      }
    }
  }

  rule('3. feature_list.json y escenarios');
  if (!validateFeatureList(cfg).ok) exit = 1;

  // Lint y tests no corren sobre un árbol vacío (clon limpio): muchos linters salen
  // distinto de 0 sin ficheros. Los tests se buscan en `tests` Y en `src`: Go y Rust
  // los colocan junto al código.
  const hasCode = dirHasFiles(cfg.paths.tests) || dirHasFiles(cfg.paths.src);
  if (cfg.commands.lint) {
    rule('4. Lint');
    if (!hasCode) {
      warn(`Sin código todavía en ${cfg.paths.tests}/ ni ${cfg.paths.src}/ (nada que lintar)`);
    } else {
      if (runEcho(cfg.commands.lint, cfg.tokens) === 0) ok('Lint sin errores');
      else {
        fail('Lint con errores');
        exit = 1;
      }
    }
  }

  rule(cfg.commands.lint ? '5. Tests' : '4. Tests');
  if (!cfg.commands.test) {
    warn('No hay comando de tests declarado (commands.test vacío)');
  } else if (!hasCode) {
    warn(`Sin código todavía en ${cfg.paths.tests}/ ni ${cfg.paths.src}/ (nada que testear)`);
  } else {
    if (runEcho(cfg.commands.test, cfg.tokens) === 0) ok('Todos los tests pasan');
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
  process.exit(run(cfg.commands.test, cfg.tokens));
}

/**
 * Ejecuta la prueba de mutación. Un objetivo explícito (`mutate <target>`) manda sobre
 * `mutation.targets`; una lista vacía corre el comando una vez, sin {{target}}.
 * Verde (true) solo si TODOS los objetivos superan el umbral.
 */
function runMutation(cfg, explicitTarget = '') {
  const targets = explicitTarget ? [explicitTarget] : cfg.mutation.targets;
  const list = targets.length ? targets : [''];
  const failures = [];
  for (const t of list) {
    if (list.length > 1) rule(`Mutación · ${t}`);
    if (runEcho(cfg.commands.mutate, { ...cfg.tokens, target: t }) !== 0) failures.push(t || '(proyecto)');
  }
  if (failures.length) {
    fail(`Mutación por debajo del umbral en: ${failures.join(', ')}`);
    return false;
  }
  ok(`Prueba de mutación superada (${list.length} objetivo${list.length > 1 ? 's' : ''}).`);
  return true;
}

function cmdMutate() {
  const cfg = loadConfig();
  if (!cfg.commands.mutate) {
    fail('commands.mutate vacío: declara la prueba de mutación en harness.config.json');
    process.exit(2);
  }
  const target = process.argv[3] || '';
  process.exit(runMutation(cfg, target) ? 0 : 1);
}

function cmdVerify() {
  const initRes = spawnSync(process.execPath, [__filename, 'init'], { cwd: CWD, stdio: 'inherit' });
  if ((initRes.status ?? 1) !== 0) {
    fail('verify abortado: init falló.');
    process.exit(1);
  }
  const cfg = loadConfig();
  // `init` solo AVISA si falta el comando de tests; verify, que es la puerta de cierre,
  // no certifica un cierre sin suite que ejecutar (ni sin mutador, más abajo).
  if (cfg.rules.require_tests_to_close && !cfg.commands.test) {
    fail('verify abortado: require_tests_to_close es true pero commands.test está vacío.');
    console.log(
      `\n  La puerta de tests es obligatoria para cerrar y no hay suite que ejecutar.\n` +
      `  Declara "commands": { "test": "..." } en ${CONFIG_NAME}, o pon\n` +
      `  "rules": { "require_tests_to_close": false } si este proyecto no cierra por tests.`,
    );
    process.exit(1);
  }
  if (cfg.rules.require_mutation_to_close) {
    rule('Prueba de mutación');
    if (!cfg.commands.mutate) {
      fail('verify abortado: require_mutation_to_close es true pero commands.mutate está vacío.');
      console.log(
        `\n  La puerta de mutación es obligatoria para cerrar y no hay mutador que ejecutar.\n` +
        `  Declara "commands": { "mutate": "..." } en ${CONFIG_NAME}, o pon\n` +
        `  "rules": { "require_mutation_to_close": false } si este proyecto no cierra por mutación.`,
      );
      process.exit(1);
    }
    if (!runMutation(cfg)) {
      fail('verify abortado: la prueba de mutación no supera el umbral.');
      process.exit(1);
    }
  }
  console.log(`\n${green(bold('[verify] Todo verde. Puedes cerrar la sesión.'))}`);
  process.exit(0);
}

function cmdStatus() {
  const cfg = loadConfig();
  const v = validateFeatureList(cfg);
  rule('Estado de features');
  if (v.absent) {
    console.log(`  (sin ${cfg.paths.feature_list}: es opcional; nada que resumir)`);
  } else if (v.ok && !v.features.length) {
    console.log('  (sin features definidas todavía)');
  } else {
    for (const f of v.features) {
      const status = typeof f.status === 'string' ? f.status : '(sin estado)';
      const tag = { done: green, in_progress: yellow, blocked: red }[status] || ((s) => s);
      console.log(`  #${String(f.id ?? '?').padStart(2)} ${tag(status.padEnd(12))} ${f.name ?? '(sin nombre)'}${f.sdd ? ' (sdd)' : ''}`);
    }
  }
  // Informativo, pero no verde sobre una lista inválida (el [FAIL] ya se imprimió).
  process.exit(v.ok ? 0 : 1);
}

function help() {
  console.log(`${bold('Arnés SSD "Uncle Bob" — motor agnóstico')}

  node .harness/harness.mjs <comando>

  ${bold('init')}     Verifica entorno, ficheros base, feature_list.json (opcional), lint y tests.
  ${bold('test')}     Ejecuta config.commands.test.
  ${bold('mutate')}   Ejecuta la prueba de mutación (config.commands.mutate [target]).
  ${bold('verify')}   init + mutación (puerta de cierre de sesión).
  ${bold('status')}   Resume feature_list.json (opcional).
  ${bold('help')}     Esta ayuda.

  Configuración: ${CONFIG_NAME} (declara paths, commands, mutation, rules).
  Token {{py}} en commands → se resuelve a python3/python disponible.`);
}

const cmd = (process.argv[2] || 'help').toLowerCase();
const COMMANDS = { init: cmdInit, test: cmdTest, mutate: cmdMutate, verify: cmdVerify, status: cmdStatus, help };
try {
  if (!COMMANDS[cmd]) {
    fail(`Comando desconocido: ${cmd}`);
    help();
    process.exit(2);
  }
  COMMANDS[cmd]();
} catch (e) {
  fail(`Error inesperado: ${e.message} (¿${CONFIG_NAME} o feature_list.json mal formado?)`);
  process.exit(2);
}
