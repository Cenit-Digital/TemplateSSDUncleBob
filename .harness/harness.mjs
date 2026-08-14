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
//   mutate   Ejecuta la prueba de mutación (config.commands.mutate). Sin target
//            explícito itera config.mutation.targets; con target, solo ese módulo.
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

/**
 * Elimina un BOM UTF-8 inicial antes de parsear JSON. Editores de Windows
 * (Notepad, algunos flujos de PowerShell `>`/`Out-File`) guardan con BOM por
 * defecto; `JSON.parse` no lo tolera y falla con un "Unexpected token" críptico.
 * Robustez multiplataforma para los ficheros que el usuario edita a mano.
 */
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** Lee un fichero de texto UTF-8 y le quita el BOM inicial si lo tuviera. */
const readText = (p) => stripBom(fs.readFileSync(p, 'utf8'));

/**
 * true si `v` es un objeto JSON "normal": ni null, ni array. `harness.config.json`
 * y `feature_list.json` deben ser objetos; un `null`, número, string o array son
 * ediciones a mano equivocadas que, sin este guardián, revientan más adelante con
 * un `TypeError` y un stack trace en vez de un `[FAIL]` legible. Misma familia que
 * la tolerancia a BOM: robustez para los ficheros que el usuario edita a mano.
 */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Nombre legible del tipo JSON de `v`, para mensajes de error. */
const jsonKind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

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
 * Sustituye tokens en un comando ({{py}} → intérprete, {{target}} → objetivo).
 *
 * Los reemplazos se pasan como FUNCIÓN, no como string, a propósito: cuando el
 * segundo argumento de String.prototype.replace es un string, las secuencias con
 * `$` tienen significado especial (`$$` → `$`, `$&` → el propio match, `` $` ``,
 * `$'`, `$n`). Un objetivo de mutación con `$` en la ruta —legal en POSIX y
 * Windows, y habitual en artefactos generados de la JVM/Scala tipo
 * `Outer$Inner`— se corrompía en silencio: `src/a$&b.py` acababa como
 * `src/a{{target}}b.py` y el mutador corría sobre una ruta equivocada, pudiendo
 * reportar VERDE sin medir el módulo que el usuario declaró. Un reemplazo por
 * función inserta el valor TAL CUAL, sin interpretar el `$`. Misma familia que
 * los guardianes de config: que el token signifique literalmente el valor, no un
 * falso verde ni una ruta mutada por accidente. resolvePython() memoiza, así que
 * llamarla una vez por match no repite el sondeo del intérprete.
 */
function resolveCmd(cmd, tokens = {}) {
  if (!cmd) return cmd;
  return cmd
    .replace(/\{\{\s*py\s*\}\}/g, () => resolvePython())
    .replace(/\{\{\s*target\s*\}\}/g, () => tokens.target || '');
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
    cfg = JSON.parse(readText(p));
  } catch (e) {
    fail(`${CONFIG_NAME} no es JSON válido: ${e.message}`);
    process.exit(2);
  }
  if (!isPlainObject(cfg)) {
    fail(`${CONFIG_NAME} debe ser un objeto JSON (encontrado: ${jsonKind(cfg)}).`);
    console.log(
      `\nLa raíz del fichero tiene que ser un objeto { ... } con "project" y "commands".\n` +
      `Copia la plantilla de la raíz del template y declara los comandos de tu stack.`,
    );
    process.exit(2);
  }
  // `paths` y `commands` deben ser objetos { clave: string } o estar ausentes. Un
  // string o un array (edición a mano equivocada, p. ej. "commands": "go test" o
  // "commands": ["go test"] en vez de "commands": { "test": "go test" }) NO
  // revienta: Object.assign ignora los primitivos y esparce los índices de un
  // array/los caracteres de un string como claves numéricas, así que los defaults
  // (todos vacíos) SOBREVIVEN y el comando que el usuario creía haber declarado se
  // descarta en silencio. En `init` eso reporta VERDE con "no hay comando de tests"
  // pese a que el usuario declaró uno: un falso verde que traiciona la puerta —peor
  // que un fallo (límite 2)—. La misma familia que el guardián de `mutation` no-objeto,
  // que solo mira una capa más adentro; y coherente con harness.schema.json, que ya
  // declara `commands` y `paths` como "type": "object". Convertir la edición
  // equivocada en un [FAIL] legible, no en un verde engañoso.
  const CONTAINER_HINT = {
    commands: '"commands": { "test": "go test ./..." }',
    paths: '"paths": { "src": "src", "tests": "tests" }',
  };
  for (const key of ['paths', 'commands']) {
    if (cfg[key] !== undefined && !isPlainObject(cfg[key])) {
      fail(`${CONFIG_NAME}: "${key}" debe ser un objeto { clave: "valor" } (encontrado: ${jsonKind(cfg[key])}).`);
      console.log(
        `\n  Declara las claves dentro de un objeto, p. ej.  ${CONTAINER_HINT[key]}.\n` +
        `  Omitir "${key}" también es válido: el motor usa los valores por defecto.`,
      );
      process.exit(2);
    }
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
  // Los valores de `paths` y `commands` deben ser strings: los primeros se pasan
  // a path.join(...) y los segundos a resolveCmd(...).replace(...). Un número,
  // booleano, array u objeto (override a mano equivocado, p. ej. "test": 5 o
  // "feature_list": ["x.json"]) reventaría más abajo con un TypeError y un stack
  // trace en vez de un [FAIL] legible. Misma familia que la tolerancia a BOM y
  // los guardianes de objeto de la raíz, de las features y de mutation.targets:
  // convertir una edición a mano equivocada en un [FAIL] legible.
  for (const [group, obj] of [['paths', cfg.paths], ['commands', cfg.commands]]) {
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val !== 'string') {
        fail(`${CONFIG_NAME}: "${group}.${key}" debe ser un string (encontrado: ${jsonKind(val)}).`);
        process.exit(2);
      }
    }
  }
  // `mutation` debe ser un objeto { threshold, targets } o estar ausente. Un
  // string, número o array (edición a mano equivocada, p. ej. "mutation":
  // "src/x.py" en vez de "mutation": { "targets": ["src/x.py"] }) NO revienta:
  // Object.assign ignora los primitivos y esparce los índices de un array, así
  // que `targets` se queda en [] y la puerta de mutación corre sobre "todo el
  // proyecto" con {{target}} vacío reportando VERDE sin medir el objetivo que el
  // usuario creía haber declarado. Un falso verde que traiciona la puerta de
  // mutación —peor que un fallo—, la misma familia que el guardián de
  // mutation.targets, que solo mira una capa más adentro: convertir la edición
  // equivocada en un [FAIL] legible, no en un verde engañoso ni en un stack trace.
  if (cfg.mutation !== undefined && !isPlainObject(cfg.mutation)) {
    fail(`${CONFIG_NAME}: "mutation" debe ser un objeto { threshold, targets } (encontrado: ${jsonKind(cfg.mutation)}).`);
    console.log(
      `\n  Declara los módulos dentro de "targets", p. ej.  "mutation": { "targets": ["src/notes.py"] }.\n` +
      `  Omitir "mutation" también es válido: el motor usa los valores por defecto.`,
    );
    process.exit(2);
  }
  cfg.mutation = Object.assign({ threshold: 0.8, targets: [] }, cfg.mutation || {});
  // `standalone` gobierna si `init` comprueba los ficheros base del arnés
  // (AGENTS.md, CLAUDE.md, CHECKPOINTS.md, docs/workflow.md, feature_list,
  // progress/current.md): true → proyecto autónomo con los suyos; false → hereda
  // el arnés raíz y se OMITE esa comprobación. Ausente → true por defecto. Pero un
  // valor PRESENTE no-booleano —el error clásico de entrecomillar un booleano en
  // JSON: `"standalone": "false"`— se coercía EN SILENCIO a true (`typeof ... !==
  // 'boolean'` → reasignar). El sub-proyecto que el usuario quería marcar como
  // heredero (standalone:false) acababa comprobando ficheros base que no tiene y
  // fallaba con una ráfaga de "Falta archivo base" que NO menciona la causa real:
  // el valor declarado se descartaba sin avisar y el mensaje desorientaba. Es el
  // ÚNICO campo escalar de config que quedaba con coerción silenciosa; los cuatro
  // contenedores (commands, paths, mutation, rules) ya fallan legible ante un tipo
  // equivocado (#16, #18, #25). Misma familia: convertir la edición a mano
  // equivocada en un [FAIL] legible, no en un descarte mudo ni en un fallo que
  // apunta al síntoma en vez de a la causa.
  if (cfg.standalone !== undefined && typeof cfg.standalone !== 'boolean') {
    fail(`${CONFIG_NAME}: "standalone" debe ser true o false (encontrado: ${jsonKind(cfg.standalone)}).`);
    console.log(
      `\n  Es un booleano SIN comillas: "standalone": false (hereda el arnés raíz)\n` +
      `  o "standalone": true (proyecto autónomo con sus propios ficheros base).\n` +
      `  Omitir "standalone" también es válido: el motor asume true (autónomo).`,
    );
    process.exit(2);
  }
  if (cfg.standalone === undefined) cfg.standalone = true;
  // `rules` debe ser un objeto { one_feature_at_a_time, ... } o estar ausente. Es
  // el ÚLTIMO de los cuatro contenedores que harness.schema.json declara "type":
  // "object" (commands, paths, mutation, rules) que aún NO tenía guardián de forma.
  // Un string, número o array (edición a mano equivocada, p. ej. "rules":
  // "estrictas" en vez de "rules": { "one_feature_at_a_time": true }) NO revienta,
  // pero se descarta EN SILENCIO: Object.assign ignora los primitivos y esparce los
  // índices de un array como claves numéricas, así que los defaults SOBREVIVEN y el
  // motor sale VERDE sin avisar de que la config de reglas del usuario se ignoró.
  // A diferencia de commands/paths/mutation —donde el descarte deja la puerta sin
  // el comando declarado y produce un falso verde—, aquí los defaults son los
  // ESTRICTOS, así que no se debilita ninguna puerta; pero el silencio contradice a
  // los guardianes hermanos (#16, #18) y al propio harness.schema.json. Misma
  // familia: convertir la edición a mano equivocada en un [FAIL] legible, no en un
  // descarte mudo.
  if (cfg.rules !== undefined && !isPlainObject(cfg.rules)) {
    fail(`${CONFIG_NAME}: "rules" debe ser un objeto { one_feature_at_a_time, ... } (encontrado: ${jsonKind(cfg.rules)}).`);
    console.log(
      `\n  Declara las banderas dentro de un objeto, p. ej.  "rules": { "one_feature_at_a_time": true }.\n` +
      `  Omitir "rules" también es válido: el motor usa los valores por defecto (todas estrictas).`,
    );
    process.exit(2);
  }
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
    data = JSON.parse(readText(p));
  } catch (e) {
    fail(`${cfg.paths.feature_list} inválido: ${e.message}`);
    return { ok: false, features: [] };
  }
  if (!isPlainObject(data)) {
    fail(`${cfg.paths.feature_list} debe ser un objeto JSON con una clave "features" (array). Encontrado: ${jsonKind(data)}.`);
    return { ok: false, features: [] };
  }
  if (data.features !== undefined && !Array.isArray(data.features)) {
    fail(`${cfg.paths.feature_list}: "features" debe ser un array (encontrado: ${jsonKind(data.features)}).`);
    return { ok: false, features: [] };
  }

  const features = data.features || [];
  let good = true;

  // Cada entrada de "features" debe ser un objeto. Un null, string, número o
  // array sueltos (edición a mano equivocada) reventarían más abajo al leer
  // `f.status` con un TypeError y un stack trace en vez de un [FAIL] legible.
  // Misma familia que la tolerancia a BOM y el guardián de objeto de la raíz.
  const wellFormed = [];
  features.forEach((f, i) => {
    if (isPlainObject(f)) wellFormed.push(f);
    else {
      fail(`${cfg.paths.feature_list}: features[${i}] debe ser un objeto (encontrado: ${jsonKind(f)}).`);
      good = false;
    }
  });

  // Cada `name` presente debe ser un string NO VACÍO: de él DERIVA el motor
  // `features/<name>.feature` —el contrato que aprueba el humano— y, por la
  // convención anti-teléfono-descompuesto del pipeline, `progress/tdd_<name>.md`,
  // `judge_<name>.md`, `mutation_<name>.md`. El guardián de unicidad de abajo
  // filtra `typeof f.name === 'string'`, así que un name NO-string (olvidar las
  // comillas: `"name": 123`, o un `true`) ESCAPABA por completo: dos features con
  // el mismo name numérico 123 pasaban como "válido" en verde y colisionaban en el
  // mismo `features/123.feature` —justo el falso verde que la unicidad de name
  // venía a cerrar—. Un name vacío o en blanco deriva `features/.feature`, igual de
  // roto. Misma familia que el string-leaf guard de paths/commands y el `!x.trim()`
  // de mutation.targets: convertir la edición a mano equivocada en un [FAIL]
  // legible, no en un verde engañoso ni en una ruta de fichero corrupta.
  for (const f of wellFormed) {
    if (f.name !== undefined && (typeof f.name !== 'string' || !f.name.trim())) {
      const found = typeof f.name === 'string' ? 'string vacío' : jsonKind(f.name);
      fail(`${cfg.paths.feature_list}: el "name" de la feature ${f.id ?? '?'} debe ser un string no vacío (encontrado: ${found}); de él derivan ${cfg.paths.features}/<name>.feature y progress/*_<name>.md.`);
      good = false;
    }
  }

  const inProgress = wellFormed.filter((f) => f.status === 'in_progress');
  if (cfg.rules.one_feature_at_a_time && inProgress.length > 1) {
    fail(`Hay ${inProgress.length} features en in_progress (máximo 1)`);
    good = false;
  }

  // Integridad de identidad: `id` y `name` son CLAVES y deben ser únicos entre las
  // features. Los agentes referencian una feature por su `id` (un id repetido hace
  // ambigua la orden "trabaja la feature N"); y el motor DERIVA rutas de fichero de
  // su `name`: `features/<name>.feature` —el contrato que aprueba el humano— y, por
  // la convención anti-teléfono-descompuesto del pipeline, `progress/tdd_<name>.md`,
  // `judge_<name>.md`, `mutation_<name>.md`. Dos features con el mismo `name`
  // comparten el MISMO `.feature`: la puerta de aprobación humana de una tapa a la
  // otra (fs.existsSync la da por buena) y sus artefactos de progreso se pisan. Sin
  // este chequeo, esa edición a mano equivocada pasaba como "válido" verde en vez de
  // un [FAIL] legible —un falso verde sobre una lista que rompe la propia convención
  // de ficheros del arnés—, la misma familia que los guardianes de forma de config y
  // de las entradas de features. Se comparan solo los valores presentes; `id` se
  // normaliza a string para que 1 y "1" (la misma "feature 1") colisionen.
  const duplicatesOf = (values) => {
    const seen = new Set();
    const dups = new Set();
    for (const v of values) {
      if (seen.has(v)) dups.add(v);
      else seen.add(v);
    }
    return [...dups];
  };
  for (const id of duplicatesOf(
    wellFormed.filter((f) => f.id !== undefined && f.id !== null).map((f) => String(f.id)),
  )) {
    fail(`id duplicado en features: ${id} (cada feature necesita un id único)`);
    good = false;
  }
  for (const name of duplicatesOf(
    wellFormed.filter((f) => typeof f.name === 'string').map((f) => f.name),
  )) {
    fail(`name duplicado en features: "${name}" (deriva ${cfg.paths.features}/${name}.feature y progress/*_${name}.md; debe ser único)`);
    good = false;
  }

  for (const f of wellFormed) {
    if (!VALID_STATUS.includes(f.status)) {
      fail(`Estado inválido en feature ${f.id}: ${f.status}`);
      good = false;
    }
    if (f.sdd && REQUIRES_SPEC.has(f.status)) {
      // El contrato `features/<name>.feature` —el que aprueba el humano— DERIVA de
      // `f.name`. Sin un name usable no hay contrato que buscar: derivar la ruta con
      // un name ausente producía `features/undefined.feature` y un [FAIL] que
      // mandaba al usuario a crear un fichero fantasma en vez de a la causa real
      // (falta el `name`); con un name present-pero-inválido (no-string/vacío) —que
      // el guardián de name de arriba YA reportó— añadía un segundo [FAIL] sobre
      // `features/   .feature`, doble ruido para el mismo error. Guardar la
      // derivación cierra ambos: si el name falta, un mensaje que nombra la causa;
      // si es inválido, se calla (ya está reportado) y no deriva la ruta fantasma.
      // Misma familia que los guardianes de name/unicidad (#22, #24): un [FAIL]
      // legible que apunta a la causa, no a un síntoma derivado.
      if (typeof f.name !== 'string' || !f.name.trim()) {
        if (f.name === undefined) {
          fail(`feature ${f.id ?? '?'} (sdd) en ${f.status} necesita un "name" del que derivar ${cfg.paths.features}/<name>.feature; falta.`);
          good = false;
        }
        continue; // name inválido: no derivar features/undefined.feature ni un doble [FAIL]
      }
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
    // Mismo gate "¿hay código todavía?" que la puerta de tests (#19): no corras un
    // comando del proyecto sobre un árbol vacío. Un clon recién hecho de la plantilla
    // trae `src/` y `tests/` vacíos; si declara `commands.lint`, muchos linters
    // salen NO-CERO cuando su patrón no casa ningún fichero (p. ej. eslint con flat
    // config: "No files matching the pattern were found"), y `init` FALLABA en la
    // primera experiencia de quien clona —justo el clon limpio que el límite 5 de
    // AUTONOMOUS.md exige mantener en verde—. La puerta de tests ya trataba este caso
    // como WARN-no-FAIL; la de lint se quedó atrás y divergía ante la misma
    // precondición (src Y tests vacíos). Con código presente, el linter corre de
    // verdad y un fallo real sigue siendo [FAIL]: el gate no debilita la puerta
    // (límite 2), solo evita correrla antes de que haya proyecto que lintar.
    if (!dirHasFiles(cfg.paths.tests) && !dirHasFiles(cfg.paths.src)) {
      warn(`Sin código todavía en ${cfg.paths.tests}/ ni ${cfg.paths.src}/ (nada que lintar)`);
    } else {
      console.log(`$ ${resolveCmd(cfg.commands.lint)}\n`);
      const r = run(cfg.commands.lint);
      if (r.status === 0) ok('Lint sin errores');
      else {
        fail('Lint con errores');
        exit = 1;
      }
    }
  }

  rule(cfg.commands.lint ? '5. Tests' : '4. Tests');
  // Corre `commands.test` si hay código donde pueda haber tests: en `paths.tests`
  // O en `paths.src`. Mirar SOLO `paths.tests` era un falso verde para los stacks
  // que colocan los tests JUNTO al código, no en un `tests/` aparte: Go (`_test.go`
  // en el paquete) y los tests unitarios de Rust (`#[cfg(test)]` dentro de cada
  // `.rs`). Un proyecto Rust que sigue el `paths.tests: "tests"` que recomienda
  // `.harness/adapters/rust.md` pero solo tiene tests unitarios NO tiene carpeta
  // `tests/`: `dirHasFiles(tests)` daba false, el motor SALTABA `cargo test` y
  // reportaba [OK] verde aunque hubiera tests en rojo en `src/`. Un falso verde que
  // traiciona la puerta —peor que un fallo (límite 2 de AUTONOMOUS.md)—, la misma
  // familia que los guardianes de config. Con `src/` como segunda señal, esos
  // stacks corren de verdad; la plantilla recién clonada (src Y tests vacíos) sigue
  // avisando sin fallar, que es el único caso que este gate debía cubrir.
  if (!cfg.commands.test) {
    warn('No hay comando de tests declarado (commands.test vacío)');
  } else if (!dirHasFiles(cfg.paths.tests) && !dirHasFiles(cfg.paths.src)) {
    warn(`Sin código todavía en ${cfg.paths.tests}/ ni ${cfg.paths.src}/ (nada que testear)`);
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

/**
 * Resuelve la lista de objetivos de mutación a partir de la config.
 *   - `explicitTarget` no vacío → solo ese módulo (`bin/harness mutate <target>`).
 *   - lista vacía [] → `['']`: corre el comando tal cual (mutadores que cubren
 *     todo el proyecto, p. ej. Stryker, que no usan el token {{target}}).
 * Devuelve `{ list }` en caso válido o `{ error }` con un mensaje legible.
 *
 * `mutation.targets` debe ser un array de rutas no vacías. Un string (olvidar los
 * corchetes: `"targets": "src/x.py"` en vez de `["src/x.py"]`), un objeto, o una
 * entrada no-string, son ediciones a mano equivocadas. Sin este guardián se
 * degradaban en silencio a una corrida de "todo el proyecto" con `{{target}}`
 * vacío que puede reportar VERDE sin medir nada: un falso verde que traiciona la
 * puerta de mutación. Misma familia que la tolerancia a BOM y los guardianes de
 * objeto de la raíz y de las entradas de features: convertir una edición a mano
 * equivocada en un [FAIL] legible, no en un verde engañoso ni en un stack trace.
 */
function resolveMutationTargets(cfg, explicitTarget = '') {
  if (explicitTarget) return { list: [explicitTarget] };
  const t = cfg.mutation.targets;
  if (!Array.isArray(t)) {
    return {
      error:
        `${CONFIG_NAME}: "mutation.targets" debe ser un array de rutas ` +
        `(encontrado: ${jsonKind(t)}).\n` +
        `  Declara los módulos como una lista, p. ej.  "targets": ["src/notes.py"].\n` +
        `  Una lista vacía [] es válida: corre el mutador sobre todo el proyecto una vez.`,
    };
  }
  const bad = t.findIndex((x) => typeof x !== 'string' || !x.trim());
  if (bad !== -1) {
    return {
      error:
        `${CONFIG_NAME}: "mutation.targets"[${bad}] debe ser una ruta no vacía ` +
        `(encontrado: ${jsonKind(t[bad])}).`,
    };
  }
  return { list: t.length ? t : [''] };
}

/**
 * Ejecuta la prueba de mutación sobre uno o varios objetivos.
 * Verde (return true) solo si TODOS los objetivos superan el umbral.
 */
function runMutation(cfg, explicitTarget = '') {
  const { list, error } = resolveMutationTargets(cfg, explicitTarget);
  if (error) {
    fail(error);
    return false;
  }
  const failures = [];
  for (const t of list) {
    if (list.length > 1) rule(`Mutación · ${t}`);
    console.log(`$ ${resolveCmd(cfg.commands.mutate, { target: t })}\n`);
    const r = run(cfg.commands.mutate, { tokens: { target: t } });
    if (r.status !== 0) failures.push(t || '(proyecto)');
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
  if (cfg.rules.require_mutation_to_close && cfg.commands.mutate) {
    rule('Prueba de mutación');
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
  // "(sin features definidas)" solo cuando la lista es VÁLIDA y vacía. Si
  // `feature_list.json` está corrupto (features no-array), validateFeatureList
  // dejó v.features en [] tras imprimir su [FAIL]: mostrar aquí "sin features"
  // contradiría ese fallo (la lista no está vacía, está mal formada).
  if (v.ok && !v.features.length) {
    console.log('  (sin features definidas todavía)');
  } else {
    for (const f of v.features) {
      if (!isPlainObject(f)) {
        console.log(`  ${red(`(entrada inválida en features: ${jsonKind(f)})`)}`);
        continue;
      }
      const status = typeof f.status === 'string' ? f.status : '(sin estado)';
      const tag = { done: green, in_progress: yellow, blocked: red }[status] || ((s) => s);
      console.log(`  #${String(f.id ?? '?').padStart(2)} ${tag(status.padEnd(12))} ${f.name ?? '(sin nombre)'}${f.sdd ? ' (sdd)' : ''}`);
    }
  }
  // status es informativo, pero no puede reportar VERDE (exit 0) sobre un
  // feature_list.json estructuralmente inválido. validateFeatureList ya imprimió
  // el [FAIL] concreto (features no-array, entradas no-objeto, id/name duplicados,
  // estado inválido, feature sdd sin .feature...); `init` YA propaga ese fallo a su
  // exit code, pero `cmdStatus` lo descartaba y salía 0. Un script o un job de CI
  // que consulte `bin/harness status` veía verde sobre una lista corrupta: un falso
  // verde de la misma familia que el resto de guardianes del motor —peor que un
  // fallo (límite 2 de AUTONOMOUS.md)—. Propagar v.ok cierra la incoherencia.
  process.exit(v.ok ? 0 : 1);
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
