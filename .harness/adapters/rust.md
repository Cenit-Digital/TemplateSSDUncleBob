# Adaptador: Rust

Mapea el arnés a un proyecto Rust. El runner de tests es Cargo (`cargo test`);
la mutación necesita una herramienta externa (Rust no trae mutador). Ver también
la receta de `docs/configuration.md` y el adaptador `generic.md`.

## `harness.config.json`

```json
{
  "language": "rust",
  "commands": {
    "lint": "cargo clippy -- -D warnings",
    "test": "cargo test",
    "mutate": "cargo mutants --file {{target}}"
  },
  "paths": { "src": "src", "tests": "tests" },
  "mutation": { "threshold": 1.0, "targets": ["src/notes.rs"] }
}
```

- `cargo test` sale con código 0 **solo** si compila y todos los tests pasan:
  cumple el contrato de `commands.test`.
- No hay `{{py}}`/intérprete que resolver: el toolchain de Rust es un binario.
- `{{target}}` lo sustituye el motor por cada entrada de `mutation.targets`.
  `cargo mutants --file src/notes.rs` restringe los mutantes a ese fichero, así
  que los `targets` son rutas de fichero (como en Python/Node), no paquetes.

## Layout típico

Rust **coloca los tests unitarios junto al código**, en un módulo `#[cfg(test)]`
dentro del mismo `.rs`; los tests de integración van aparte, en `tests/`:

```
Cargo.toml
src/lib.rs      src/notes.rs      (cada uno con su  #[cfg(test)] mod tests)
src/main.rs
tests/cli.rs                      (tests de integración de caja negra)
```

Por eso `paths.src` apunta a `src/` y `paths.tests` a `tests/`, pero recuerda
que el grueso de los tests unitarios vive **dentro** de los ficheros de `src/`:
el arnés solo usa `paths` para orientarse.

## Mutación con cargo-mutants

[cargo-mutants](https://github.com/sourcefrog/cargo-mutants) es el mutador de
referencia para Rust. Se instala como subcomando de Cargo y no toca tu
`Cargo.toml`:

```sh
cargo install --locked cargo-mutants
```

A diferencia de gremlins (Go) o Stryker (Node), cargo-mutants **no tiene un
knob de porcentaje**: es binario. Primero corre un baseline sin mutar (si tu
suite no pasa limpia, aborta) y luego sale con código **!= 0 si sobrevive
cualquier mutante**. Eso equivale exactamente a `threshold: 1.0` y es lo que el
motor exige en los ejemplos —no hay que configurar nada extra para el 100%.

Si un mutante es **equivalente** (no observable por ningún test posible),
márcalo con el atributo `#[mutants::skip]` sobre la función —es el análogo del
pragma `// mutate: skip` del ejemplo Node— y documenta por qué, en vez de bajar
el listón:

```rust
#[mutants::skip] // equivalente: el orden de estos dos writes no es observable
fn flush(&mut self) { /* ... */ }
```

El resto de opciones (excluir globs, timeouts) se declaran en
`.cargo/mutants.toml`, junto al `Cargo.toml`.

## Producción

- Añade `build` (`cargo build --release`) y mantén `lint` en
  `cargo clippy -- -D warnings` para que los avisos rompan la build.
- Para workspaces con varios crates, apunta `mutation.targets` a los ficheros de
  dominio y deja fuera `main.rs` y el pegamento de IO, igual que se acota en los
  ejemplos Python/Node.
- `cargo mutants` puede paralelizar con `--jobs N` y cachear el baseline; útil
  cuando la suite es lenta.

## Si no quieres depender de cargo-mutants

Puedes portar el mutador de los ejemplos (`examples/python-notes-cli/tools/mutate.py`
o `examples/node-notes-cli/tools/mutate.mjs`): ~200 líneas sin dependencias que
mutan operadores, palabras clave, números y `return`, validan que el mutante
compile (`cargo build`) y restauran el original. Es un buen punto de partida
mientras no exista un `examples/rust-notes-cli` nativo.
