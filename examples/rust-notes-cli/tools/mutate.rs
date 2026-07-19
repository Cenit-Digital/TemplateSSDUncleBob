//! Mutador mínimo y sin dependencias para prueba de mutación en Rust.
//!
//! Introduce un defecto pequeño en un archivo de `src/`, recompila y corre la
//! suite (`cargo test --lib`) y comprueba si algún test falla (mutante MUERTO) o
//! si todos pasan (mutante SOBREVIVIENTE). Un sobreviviente es un agujero en la
//! red de tests.
//!
//!     cargo run --quiet --bin mutate -- src/cli.rs
//!
//! Diseño (espeja `tools/mutate.go`, `mutate.mjs` y `mutate.py` de los otros
//! ejemplos):
//!   - Enmascara cadenas, comentarios y literales de carácter antes de escanear,
//!     así NUNCA muta su contenido: solo operadores, enteros y `true`/`false`.
//!   - Enmascara también los módulos `#[cfg(test)]`: como Rust coloca los tests
//!     dentro del mismo fichero, hay que excluirlos para no mutar el código de
//!     test (el equivalente a que Go solo mute `cli.go`, no `cli_test.go`).
//!   - Descarta los mutantes que no compilan (`cargo test --lib --no-run`); no
//!     inflan el score, igual que el filtro `compile()`/`--check` de los otros.
//!   - Restaura SIEMPRE el archivo original, pase lo que pase.
//!   - Respeta el pragma de línea `// mutate: skip` (mutantes equivalentes, con
//!     justificación explícita en el propio comentario).
//!
//! Ver docs/mutation-testing.md y .harness/adapters/rust.md.

use std::fs;
use std::process::{Command, Stdio};

const SKIP: &str = "mutate: skip";

// Mutaciones de operador (longest-match: los de 2 caracteres van primero).
const OPS: &[(&str, &str)] = &[
    ("==", "!="),
    ("!=", "=="),
    ("<=", "<"),
    (">=", ">"),
    ("&&", "||"),
    ("||", "&&"),
    ("<", "<="),
    (">", ">="),
    ("+", "-"),
    ("-", "+"),
];

#[derive(Clone)]
struct Mutant {
    offset: usize,
    length: usize,
    orig: String,
    repl: String,
    label: String,
    line: usize,
}

impl Mutant {
    fn apply(&self, src: &str) -> String {
        let mut out = String::with_capacity(src.len() + self.repl.len());
        out.push_str(&src[..self.offset]);
        out.push_str(&self.repl);
        out.push_str(&src[self.offset + self.length..]);
        out
    }

    fn describe(&self, path: &str) -> String {
        format!(
            "{}:{}  {}  ({:?} -> {:?})",
            path, self.line, self.label, self.orig, self.repl
        )
    }
}

fn blank(out: &mut [u8], from: usize, to: usize) {
    for b in out.iter_mut().take(to).skip(from) {
        if *b != b'\n' {
            *b = b' ';
        }
    }
}

/// Devuelve una copia de `src` con cadenas, comentarios, literales de carácter y
/// módulos `#[cfg(test)]` en blanco (misma longitud; se conservan los saltos de
/// línea). Sobre esta copia se detectan las posiciones a mutar.
fn mask(src: &[u8]) -> Vec<u8> {
    let n = src.len();
    let mut out = src.to_vec();
    let mut i = 0;
    while i < n {
        let c = src[i];
        let next = if i + 1 < n { src[i + 1] } else { 0 };
        if c == b'/' && next == b'/' {
            let mut j = i;
            while j < n && src[j] != b'\n' {
                j += 1;
            }
            blank(&mut out, i, j);
            i = j;
        } else if c == b'/' && next == b'*' {
            // Comentario de bloque, con anidamiento (como Rust).
            let mut j = i + 2;
            let mut depth = 1;
            while j < n && depth > 0 {
                if src[j] == b'/' && j + 1 < n && src[j + 1] == b'*' {
                    depth += 1;
                    j += 2;
                } else if src[j] == b'*' && j + 1 < n && src[j + 1] == b'/' {
                    depth -= 1;
                    j += 2;
                } else {
                    j += 1;
                }
            }
            blank(&mut out, i, j.min(n));
            i = j.min(n);
        } else if c == b'"' {
            let mut j = i + 1;
            while j < n {
                if src[j] == b'\\' {
                    j += 2;
                    continue;
                }
                if src[j] == b'"' {
                    j += 1;
                    break;
                }
                j += 1;
            }
            let end = j.min(n);
            blank(&mut out, i, end);
            i = end;
        } else if c == b'\'' {
            // ¿Literal de carácter ('x', '\n', b'x') o lifetime/label ('a)?
            if next == b'\\' {
                // Carácter escapado: '\'  hasta la comilla de cierre.
                let mut j = i + 2;
                while j < n && src[j] != b'\'' {
                    j += 1;
                }
                if j < n {
                    j += 1;
                }
                let end = j.min(n);
                blank(&mut out, i, end);
                i = end;
            } else if i + 2 < n && src[i + 2] == b'\'' {
                // Carácter simple: 'x'.
                blank(&mut out, i, i + 3);
                i += 3;
            } else {
                // Lifetime o label ('a, 'static): no enmascarar.
                i += 1;
            }
        } else {
            i += 1;
        }
    }
    mask_test_modules(&mut out);
    out
}

/// Pone en blanco cada bloque `#[cfg(test)] mod ... { ... }` (buscando el `{` que
/// sigue y su `}` emparejada). Se ejecuta sobre la copia ya enmascarada, así las
/// llaves dentro de cadenas no cuentan.
fn mask_test_modules(out: &mut [u8]) {
    let needle = b"#[cfg(test)]";
    let n = out.len();
    let mut i = 0;
    while i + needle.len() <= n {
        if &out[i..i + needle.len()] == needle {
            let mut j = i + needle.len();
            while j < n && out[j] != b'{' {
                j += 1;
            }
            if j < n {
                let start = i;
                let mut depth = 0i32;
                let mut k = j;
                while k < n {
                    if out[k] == b'{' {
                        depth += 1;
                    } else if out[k] == b'}' {
                        depth -= 1;
                        if depth == 0 {
                            k += 1;
                            break;
                        }
                    }
                    k += 1;
                }
                let end = k.min(n);
                blank(out, start, end);
                i = end;
                continue;
            }
        }
        i += 1;
    }
}

fn line_of(src: &str, offset: usize) -> usize {
    src[..offset].bytes().filter(|&b| b == b'\n').count() + 1
}

fn line_text(src: &str, offset: usize) -> &str {
    let start = src[..offset].rfind('\n').map(|p| p + 1).unwrap_or(0);
    let end = src[offset..]
        .find('\n')
        .map(|p| offset + p)
        .unwrap_or(src.len());
    &src[start..end]
}

fn is_token_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Genera los mutantes candidatos: operadores, enteros y `true`/`false`.
fn generate_mutants(src: &str) -> Vec<Mutant> {
    let bytes = src.as_bytes();
    let masked = mask(bytes);
    let n = masked.len();
    let mut mutants: Vec<Mutant> = Vec::new();

    let push = |mutants: &mut Vec<Mutant>, offset: usize, length: usize, repl: String, label: &str| {
        if line_text(src, offset).contains(SKIP) {
            return;
        }
        mutants.push(Mutant {
            offset,
            length,
            orig: src[offset..offset + length].to_string(),
            repl,
            label: label.to_string(),
            line: line_of(src, offset),
        });
    };

    // Operadores (con guardas para no tocar '->' ni '=>').
    let mut i = 0;
    while i < n {
        let mut matched = false;
        for (pat, repl) in OPS {
            let pb = pat.as_bytes();
            if i + pb.len() <= n && &masked[i..i + pb.len()] == pb {
                let prev = if i > 0 { masked[i - 1] } else { 0 };
                let after = if i + pb.len() < n { masked[i + pb.len()] } else { 0 };
                let is_arrow = (*pat == ">" && (prev == b'=' || prev == b'-'))
                    || (*pat == "-" && after == b'>');
                if !is_arrow {
                    push(&mut mutants, i, pb.len(), repl.to_string(), "operador");
                }
                i += pb.len();
                matched = true;
                break;
            }
        }
        if !matched {
            i += 1;
        }
    }

    // Identificadores (true/false) y enteros decimales, sobre tokens completos.
    let mut i = 0;
    while i < n {
        if !is_token_byte(masked[i]) {
            i += 1;
            continue;
        }
        let start = i;
        while i < n && is_token_byte(masked[i]) {
            i += 1;
        }
        let tok = &src[start..i];
        if tok == "true" {
            push(&mut mutants, start, tok.len(), "false".to_string(), "palabra");
        } else if tok == "false" {
            push(&mut mutants, start, tok.len(), "true".to_string(), "palabra");
        } else if tok.bytes().all(|b| b.is_ascii_digit()) {
            let prev = if start > 0 { masked[start - 1] } else { 0 };
            let after = if i < n { masked[i] } else { 0 };
            // Evita la parte entera de un float y los separadores de dígitos.
            if prev == b'.' || after == b'.' {
                continue;
            }
            if let Ok(v) = tok.parse::<u128>() {
                push(&mut mutants, start, tok.len(), (v + 1).to_string(), "número");
            }
        }
    }

    mutants.sort_by_key(|m| m.offset);
    mutants
}

fn cargo_ok(args: &[&str]) -> bool {
    Command::new("cargo")
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn compiles() -> bool {
    cargo_ok(&["test", "--lib", "--no-run", "--quiet"])
}

fn tests_pass() -> bool {
    cargo_ok(&["test", "--lib", "--quiet"])
}

fn main() {
    let path = match std::env::args().nth(1) {
        Some(p) => p,
        None => {
            eprintln!("uso: mutate <archivo.rs>");
            std::process::exit(2);
        }
    };

    let original = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("no pude leer {}: {}", path, e);
            std::process::exit(2);
        }
    };

    // Cordura: la suite debe estar VERDE antes de mutar.
    if !tests_pass() {
        eprintln!("[FAIL] La suite está roja sin mutar. Arregla los tests primero.");
        std::process::exit(2);
    }

    let restore = |src: &str| {
        let _ = fs::write(&path, src);
    };

    let candidates = generate_mutants(&original);

    // Primer filtro: descartar los que no compilan (no inflan el score).
    let mut valid: Vec<Mutant> = Vec::new();
    let mut skipped_noncompile = 0;
    for m in &candidates {
        fs::write(&path, m.apply(&original)).expect("no pude escribir el mutante");
        if compiles() {
            valid.push(m.clone());
        } else {
            skipped_noncompile += 1;
        }
    }
    restore(&original);

    println!(
        "── Mutando {} ─ {} mutantes válidos ({} descartados por no compilar)",
        path,
        valid.len(),
        skipped_noncompile
    );

    let mut killed = 0usize;
    let mut survived: Vec<Mutant> = Vec::new();
    for (idx, m) in valid.iter().enumerate() {
        fs::write(&path, m.apply(&original)).expect("no pude escribir el mutante");
        let alive = tests_pass();
        let mark = if alive {
            survived.push(m.clone());
            "SOBREVIVE"
        } else {
            killed += 1;
            "muerto"
        };
        println!("  [{}/{}] {:<9} {}", idx + 1, valid.len(), mark, m.describe(&path));
    }
    restore(&original);

    let total = valid.len();
    let score = if total == 0 {
        100.0
    } else {
        killed as f64 / total as f64 * 100.0
    };

    println!("\n── Resumen ──────────────────────────────────────");
    println!("  total:    {}", total);
    println!("  killed:   {}", killed);
    println!("  survived: {}", survived.len());
    println!("  score:    {:.1}%", score);
    if !survived.is_empty() {
        println!("\n  Mutantes sobrevivientes (agujeros en la red):");
        for m in &survived {
            println!("   - {}", m.describe(&path));
        }
        std::process::exit(1);
    }
}
