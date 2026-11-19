#!/usr/bin/env node
// impeccable-gate.mjs — Puerta de diseño de la CI: el detector de Impeccable sobre las rutas web del proyecto.
//
//   node .harness/impeccable-gate.mjs
//
// Lee `ui.paths` de harness.config.json (rutas relativas: código de la web y, si el workflow lo construye antes,
// su salida). Sin rutas declaradas el proyecto no tiene web: lo dice y sale con 0 sin ejecutar el detector.
// Con rutas, exige:
//   1. La skill instalada en .claude/skills/impeccable y .agents/skills/impeccable, en la versión que fija esta puerta.
//   2. Hooks de Impeccable apagados: ni en .claude/settings.json ni en .codex/hooks.json, y `hook.enabled: false` si
//      existe .impeccable/config.json (el agente sin interfaz no puede aprobarlos).
//   3. Excepciones solo justificadas: nada en detector.ignoreRules ni detector.ignoreFiles (silencian demasiado);
//      cada detector.ignoreValues y cada comentario `impeccable-disable…` lleva su motivo (tras «:» o «--»).
//   4. Cada ruta existe y tiene algo que el detector analiza (una carpeta vacía saldría con 0 sin mirar nada).
//   5. `impeccable detect --json --report-unused-ignores` sin ninguna entrada. Cuentan también los avisos
//      («advisory», que el detector no cuenta como fallo y deja salir con 0) y los ignorados que ya no ignoran nada.
// Códigos del detector (comprobados a mano con la 4.10.0): 0 sin hallazgos, 2 con hallazgos, 1 si no pudo escanear.
// Salida: 0 limpio o sin web · 1 hallazgos o una comprobación falla · 2 error de configuración o del detector.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const VERSION = '4.10.0';
export const SKILL_DIRS = ['.claude/skills/impeccable', '.agents/skills/impeccable'];
/** Extensiones que analiza el detector (README del CLI y reference/hooks.md de la skill). */
export const UI_EXT = ['.html', '.htm', '.css', '.scss', '.sass', '.less', '.jsx', '.tsx', '.vue', '.svelte', '.astro'];
const SKIP_DIRS = new Set(['node_modules', '.git']);
const INLINE = /impeccable-disable(?:-next-line|-line)?\b(.*)$/;

const paint = (code) => (s) => (process.env.NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const out = {
  ok: (s) => console.log(`${paint('0;32')('[OK]')}    ${s}`),
  fail: (s) => console.log(`${paint('0;31')('[FAIL]')}  ${s}`),
};

class ConfigError extends Error {}
const safe = (p) => typeof p === 'string' && p !== '' && !p.includes('\\')
  && !path.posix.isAbsolute(p) && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..');

/** Rutas web declaradas en harness.config.json (`ui.paths`); [] si no hay. */
export function uiPaths(root) {
  const file = path.join(root, 'harness.config.json');
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new ConfigError(`harness.config.json ilegible (${e.code ?? e.message}).`);
  }
  const paths = cfg?.ui?.paths ?? [];
  if (!Array.isArray(paths) || !paths.every(safe)) throw new ConfigError('harness.config.json: "ui.paths" debe ser una lista de rutas relativas seguras.');
  return paths;
}

/** Ficheros que el detector analiza bajo `rel` (un fichero o una carpeta), sin node_modules ni .git. */
export function uiFiles(root, rel) {
  const found = [];
  const walk = (abs) => {
    const st = fs.statSync(abs);
    if (st.isFile()) { if (UI_EXT.includes(path.extname(abs).toLowerCase())) found.push(abs); return; }
    if (!st.isDirectory()) return;
    for (const e of fs.readdirSync(abs)) if (!SKIP_DIRS.has(e)) walk(path.join(abs, e));
  };
  walk(path.join(root, rel));
  return found;
}

/** Versión del front matter de un SKILL.md; null si no la tiene. */
export function skillVersion(root, dir) {
  const f = path.join(root, dir, 'SKILL.md');
  if (!fs.existsSync(f)) return null;
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(f, 'utf8'));
  // Claude la pone en `version:`; Codex, en `metadata:` → `  version:` (sangrada).
  return m ? (/^\s*version:\s*["']?([^"'\s]+)/m.exec(m[1])?.[1] ?? null) : null;
}

/** Problemas de instalación y de hooks (lista de textos; vacía si todo está bien). */
export function checkInstall(root) {
  const problems = [];
  for (const dir of SKILL_DIRS) {
    const v = skillVersion(root, dir);
    if (v !== VERSION) problems.push(`${dir}: ${v === null ? 'falta la skill' : `versión ${v}`}; esta puerta fija la ${VERSION} (npx impeccable@${VERSION} install --scope=project --providers=claude,codex --no-hooks).`);
    for (const lic of ['LICENSE', 'NOTICE.md']) if (!fs.existsSync(path.join(root, dir, lic))) problems.push(`${dir}/${lic}: falta (Apache-2.0 exige conservarlo).`);
  }
  for (const f of ['.claude/settings.json', '.codex/hooks.json']) {
    const p = path.join(root, f);
    if (fs.existsSync(p) && /impeccable/i.test(fs.readFileSync(p, 'utf8'))) problems.push(`${f}: trae un hook de Impeccable; van apagados (instala con --no-hooks).`);
  }
  return problems;
}

/** Problemas de .impeccable/config.json: hooks encendidos y excepciones sin justificar. */
export function checkConfig(root) {
  const f = path.join(root, '.impeccable', 'config.json');
  if (!fs.existsSync(f)) return [];
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
    throw new ConfigError(`.impeccable/config.json ilegible (${e.code ?? e.message}).`);
  }
  const problems = [];
  if (cfg?.hook?.enabled !== false) problems.push('.impeccable/config.json: hook.enabled debe ser false (`impeccable hooks off`).');
  const d = cfg?.detector ?? {};
  for (const k of ['ignoreRules', 'ignoreFiles']) {
    if ((d[k] ?? []).length > 0) problems.push(`.impeccable/config.json: detector.${k} no está permitido (${d[k].join(', ')}); corrige el diseño o usa una excepción justificada por valor.`);
  }
  for (const v of d.ignoreValues ?? []) {
    if (typeof v?.reason !== 'string' || v.reason.trim() === '') problems.push(`.impeccable/config.json: la excepción ${v?.rule}=${v?.value} no tiene motivo (--reason).`);
  }
  return problems;
}

/** Comentarios `impeccable-disable…` sin motivo (tras «:» o «--») en los ficheros web. */
export function checkInline(root, files) {
  const problems = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const m = INLINE.exec(line);
      if (!m) return;
      const body = m[1].replace(/(?:\s*(?:-->|\*\/|\}))+\s*$/, ''); // sin el cierre del comentario (HTML, CSS/JS, JSX)
      const reason = /(?::|\s--\s)\s*(.*)$/.exec(body)?.[1]?.trim();
      if (!reason) problems.push(`${path.relative(root, f)}:${i + 1}: excepción sin motivo («impeccable-disable… <regla>: <motivo>»).`);
    });
  }
  return problems;
}

/** Lanza el detector fijado y devuelve {code, findings} (findings null si la salida no es JSON). */
export function detect(root, paths) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(npx, ['--yes', `impeccable@${VERSION}`, 'detect', '--json', '--report-unused-ignores', ...paths], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32',
  });
  let findings = null;
  try { findings = JSON.parse(r.stdout); } catch { /* findings queda en null */ }
  return { code: r.status ?? (r.error ? -1 : null), findings: Array.isArray(findings) ? findings : null, error: r.error?.message };
}

/** Ejecuta la puerta en `root`. `run` sustituye al detector en los tests. Devuelve el código de salida. */
export function gate(root, { run = detect } = {}) {
  const paths = uiPaths(root);
  const problems = checkInstall(root);
  if (paths.length === 0) {
    problems.forEach(out.fail);
    if (problems.length > 0) return 1;
    out.ok(`Impeccable ${VERSION} instalado; el proyecto no declara web (ui.paths vacío en harness.config.json): el detector no se ejecuta.`);
    return 0;
  }
  problems.push(...checkConfig(root));
  const files = [];
  for (const p of paths) {
    if (!fs.existsSync(path.join(root, p))) { problems.push(`${p}: no existe (ui.paths).`); continue; }
    const found = uiFiles(root, p);
    if (found.length === 0) problems.push(`${p}: no tiene nada que el detector analice (${UI_EXT.join(' ')}); ¿falta el build?`);
    files.push(...found);
  }
  problems.push(...checkInline(root, files));
  if (problems.length > 0) { problems.forEach(out.fail); return 1; }

  const r = run(root, paths);
  if (r.code === 1 || r.findings === null || (r.code !== 0 && r.code !== 2)) {
    out.fail(`el detector no pudo escanear (código ${r.code}${r.error ? `, ${r.error}` : ''}).`);
    return 2;
  }
  if (r.findings.length === 0 && r.code === 0) {
    out.ok(`Impeccable ${VERSION}: 0 hallazgos y 0 avisos en ${paths.join(', ')} (${files.length} ficheros).`);
    return 0;
  }
  for (const x of r.findings) {
    const where = `${path.relative(root, x.file ?? '') || x.file}${x.line ? `:${x.line}` : ''}`;
    out.fail(`${where} [${x.antipattern}]${x.advisory ? ' (aviso)' : ''} ${x.snippet ?? x.name ?? ''}`);
  }
  out.fail(`Impeccable ${VERSION}: ${r.findings.length} hallazgo(s)${r.code === 2 && r.findings.length === 0 ? ' (código 2 sin entradas)' : ''}. Corrígelos (/impeccable audit, polish); una excepción solo con motivo.`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { process.exitCode = gate(process.cwd()); } catch (e) {
    out.fail(e.message);
    process.exitCode = 2;
  }
}
