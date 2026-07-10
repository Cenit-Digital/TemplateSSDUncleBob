#!/usr/bin/env node
// Mutador mínimo y sin dependencias para prueba de mutación en Node/JS.
//
// Introduce un defecto pequeño en un archivo de `src/`, corre la suite
// (`node --test`) y comprueba si algún test falla (mutante MUERTO) o si todos
// pasan (mutante SOBREVIVIENTE). Un sobreviviente es un agujero en la red.
//
//   node tools/mutate.mjs src/cli.mjs
//   node tools/mutate.mjs src/cli.mjs --max 80
//
// Diseño:
// - Enmascara strings, plantillas y comentarios antes de escanear, así NUNCA
//   muta su contenido: solo operadores, palabras clave, números y `return`.
// - Descarta los mutantes que no parsean (`node --check`); no inflan el score.
// - Restaura SIEMPRE el archivo original, incluso ante un fallo (bloque
//   `finally`).
// - Respeta el pragma de línea `// mutate: skip` (para mutantes equivalentes,
//   con justificación explícita en el propio comentario).
//
// Ver docs/mutation-testing.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TEST_CMD = ['--test'];
const SKIP_PRAGMA = 'mutate: skip';

const OP_MUTATIONS = {
  '===': '!==', '!==': '===', '==': '!=', '!=': '==',
  '<=': '<', '>=': '>', '<': '<=', '>': '>=',
  '&&': '||', '||': '&&', '+': '-', '-': '+',
};
const OP_BY_LENGTH = [3, 2, 1].map((len) =>
  Object.keys(OP_MUTATIONS).filter((op) => op.length === len),
);

const WORD_MUTATIONS = { true: 'false', false: 'true' };

/** Devuelve una copia de `src` con strings, plantillas y comentarios en blanco
 * (misma longitud; se conservan los saltos de línea). */
function mask(src) {
  const out = src.split('');
  let i = 0;
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      blank(i, j);
      i = j;
    } else if (c === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === quote) {
          j++;
          break;
        }
        j++;
      }
      blank(i, j);
      i = j;
    } else {
      i++;
    }
  }
  return out.join('');
}

function lineOf(src, index) {
  let line = 1;
  for (let k = 0; k < index; k++) {
    if (src[k] === '\n') line++;
  }
  return line;
}

function lineText(src, index) {
  let start = index;
  while (start > 0 && src[start - 1] !== '\n') start--;
  let end = index;
  while (end < src.length && src[end] !== '\n') end++;
  return src.slice(start, end);
}

function isIdentChar(ch) {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

/** Genera la lista de mutantes {start,end,orig,repl,label} sobre el código. */
function generateMutants(src) {
  const masked = mask(src);
  const mutants = [];
  const push = (start, end, repl, label) => {
    if (lineText(src, start).includes(SKIP_PRAGMA)) return;
    mutants.push({ start, end, orig: src.slice(start, end), repl, label,
      line: lineOf(src, start) });
  };

  // Operadores (longest-match; salta el '>' de '=>').
  let i = 0;
  while (i < masked.length) {
    let matched = false;
    for (const group of OP_BY_LENGTH) {
      for (const op of group) {
        if (masked.startsWith(op, i)) {
          const isArrow = op === '>' && masked[i - 1] === '=';
          if (!isArrow) {
            push(i, i + op.length, OP_MUTATIONS[op], `operador ${op}`);
          }
          i += op.length;
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) i++;
  }

  // Palabras clave (true/false) y números enteros, sobre tokens completos.
  const wordRe = /\b([A-Za-z_$][A-Za-z0-9_$]*|\d+)\b/g;
  let m;
  while ((m = wordRe.exec(masked)) !== null) {
    const tok = m[0];
    const start = m.index;
    if (Object.prototype.hasOwnProperty.call(WORD_MUTATIONS, tok)) {
      push(start, start + tok.length, WORD_MUTATIONS[tok], `palabra ${tok}`);
    } else if (/^\d+$/.test(tok)) {
      // evita mutar la parte entera de un float (p. ej. 1 en 1.5)
      if (masked[start - 1] === '.' || masked[start + tok.length] === '.') continue;
      push(start, start + tok.length, String(Number(tok) + 1), `número ${tok}`);
    }
  }

  // return <expr>  ->  return null
  const retRe = /\breturn\b/g;
  while ((m = retRe.exec(masked)) !== null) {
    const start = m.index;
    let j = start + 'return'.length;
    // separa 'return' del identificador (no mutar 'returnValue')
    if (isIdentChar(masked[j])) continue;
    let end = j;
    while (end < masked.length && masked[end] !== ';' && masked[end] !== '\n') end++;
    const expr = src.slice(j, end).trim();
    if (expr === '' || expr === 'null' || expr === 'undefined') continue;
    push(start, end, 'return null', 'retorno');
  }

  return mutants.sort((a, b) => a.start - b.start);
}

function applyMutant(src, mutant) {
  return src.slice(0, mutant.start) + mutant.repl + src.slice(mutant.end);
}

function parses(source) {
  const res = spawnSync(process.execPath, ['--check', '--input-type=module', '-'],
    { input: source, encoding: 'utf8' });
  return res.status === 0;
}

function runTests() {
  const res = spawnSync(process.execPath, TEST_CMD, { stdio: 'ignore' });
  return res.status === 0;
}

function describe(mutant, path) {
  return `${path}:${mutant.line}  ${mutant.label}  (${JSON.stringify(mutant.orig)} -> ${JSON.stringify(mutant.repl)})`;
}

function main(argv) {
  const args = argv.slice(2);
  const path = args.find((a) => !a.startsWith('--'));
  const maxArg = args.indexOf('--max');
  const max = maxArg === -1 ? 200 : Number(args[maxArg + 1]);
  if (!path) {
    process.stderr.write('uso: node tools/mutate.mjs <archivo> [--max N]\n');
    return 2;
  }

  const original = readFileSync(path, 'utf8');

  if (!runTests()) {
    process.stderr.write('[FAIL] La suite está roja sin mutar. Arregla los tests primero.\n');
    return 2;
  }

  let mutants = generateMutants(original).filter((m) => parses(applyMutant(original, m)));
  const skippedNonParse = generateMutants(original).length - mutants.length;
  let truncated = 0;
  if (mutants.length > max) {
    truncated = mutants.length - max;
    mutants = mutants.slice(0, max);
  }

  const killed = [];
  const survived = [];
  process.stdout.write(`── Mutando ${path} ─ ${mutants.length} mutantes válidos ` +
    `(${skippedNonParse} descartados por no parsear)\n`);
  try {
    mutants.forEach((mutant, idx) => {
      writeFileSync(path, applyMutant(original, mutant), 'utf8');
      const alive = runTests();
      (alive ? survived : killed).push(mutant);
      process.stdout.write(`  [${idx + 1}/${mutants.length}] ${(alive ? 'SOBREVIVE' : 'muerto').padEnd(9)} ${describe(mutant, path)}\n`);
    });
  } finally {
    writeFileSync(path, original, 'utf8');
  }

  const total = mutants.length;
  const score = total ? (killed.length / total) * 100 : 100;
  process.stdout.write('\n── Resumen ──────────────────────────────────────\n');
  process.stdout.write(`  total:    ${total}\n`);
  process.stdout.write(`  killed:   ${killed.length}\n`);
  process.stdout.write(`  survived: ${survived.length}\n`);
  process.stdout.write(`  score:    ${score.toFixed(1)}%\n`);
  if (truncated) {
    process.stdout.write(`  [WARN] ${truncated} mutantes válidos NO evaluados (límite --max=${max}).\n`);
  }
  if (survived.length) {
    process.stdout.write('\n  Mutantes sobrevivientes (agujeros en la red):\n');
    for (const s of survived) {
      process.stdout.write(`   - ${describe(s, path)}\n`);
    }
  }
  return survived.length === 0 ? 0 : 1;
}

process.exit(main(process.argv));
