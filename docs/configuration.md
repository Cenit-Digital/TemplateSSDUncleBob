# Configuración — cómo adaptar el arnés a cualquier stack

> El proceso Uncle Bob (spec → Gherkin → TDD → judge → mutación), los agentes
> y las puertas son **fijos**. Lo único que cambia por proyecto son los
> comandos de tu stack, declarados en `harness.config.json`. Eso es lo que
> hace a esta plantilla agnóstica al lenguaje.

## El motor

`.harness/harness.mjs` es un motor de **cero dependencias** (solo la stdlib de
Node ≥ 18). Lee `harness.config.json` del directorio actual y ejecuta los
comandos que declaras. Se invoca con los lanzadores:

- POSIX/macOS/Linux: `./init.sh`, `bin/harness <cmd>`
- Windows/PowerShell: `pwsh ./init.ps1`, `bin\harness.ps1 <cmd>`
- Directo: `node .harness/harness.mjs <cmd>`

Comandos: `init`, `test`, `mutate [target]`, `verify`, `status`, `help`.

## `harness.config.json` — campos

```jsonc
{
  "$schema": "./harness.schema.json",
  "project": "mi-proyecto",
  "language": "python",          // etiqueta informativa
  "standalone": true,             // false = hereda el arnés raíz (para examples/)
  "commands": {
    "install": "…",               // opcional
    "lint":    "…",               // vacío = se omite
    "test":    "…",               // sale 0 si todo pasa
    "mutate":  "…",               // sale != 0 si no supera el umbral
    "build":   "…"                // opcional
  },
  "paths": {                       // por si tu layout difiere de los defaults
    "src": "src", "tests": "tests", "features": "features",
    "progress": "progress", "spec": "project-spec.md",
    "feature_list": "feature_list.json"
  },
  "mutation": { "threshold": 0.8, "targets": ["src/…"] },
  "rules": {
    "one_feature_at_a_time": true,
    "require_approved_spec_to_implement": true,
    "require_tests_to_close": true,
    "require_mutation_to_close": true
  }
}
```

### Tokens en `commands`

- `{{py}}` → se resuelve al intérprete de Python disponible (`python3` o
  `python`). Útil para portabilidad Windows/Unix.
- `{{target}}` → en `commands.mutate`, recibe el módulo a mutar. Si pasas
  `bin/harness mutate <target>`, ese único módulo; si lo omites (`bin/harness
  mutate` o `bin/harness verify`), el motor **itera `mutation.targets`** y solo
  da verde si todos superan el umbral. Con `mutation.targets` vacía se ejecuta
  el comando tal cual (mutadores que cubren todo el proyecto, p. ej. Stryker).

## Recetas por stack (adaptadores)

### Python (cero dependencias) — ver `examples/python-notes-cli`

```json
"commands": {
  "test":   "{{py}} -m unittest discover -s tests -q",
  "mutate": "{{py}} tools/mutate.py {{target}}"
}
```

### Node / TypeScript (cero dependencias) — ver `examples/node-notes-cli`

```json
"commands": {
  "test":   "node --test",
  "mutate": "node tools/mutate.mjs {{target}}"
}
```

### Node / TypeScript de producción (Vitest + Stryker + ESLint)

```json
"commands": {
  "install": "pnpm install",
  "lint":    "eslint . && tsc --noEmit",
  "test":    "vitest run",
  "mutate":  "stryker run",
  "build":   "vite build"
}
```

### Go — ver `.harness/adapters/go.md` y `examples/go-notes-cli`

```json
"commands": {
  "lint":   "go vet ./...",
  "test":   "go test ./...",
  "mutate": "gremlins unleash {{target}} --dry-run=false"
}
```

`gremlins` es la herramienta de mutación de referencia para producción. El
ejemplo `examples/go-notes-cli` usa en su lugar un mutador propio sin
dependencias (`tools/mutate.go`, sobre `go/scanner`, `"mutate": "go run ./tools
{{target}}"`), coherente con los mutadores caseros de los ejemplos Python/Node.

### Rust — ver `.harness/adapters/rust.md` y `examples/rust-notes-cli`

```json
"commands": {
  "lint":   "cargo clippy -- -D warnings",
  "test":   "cargo test",
  "mutate": "cargo mutants --file {{target}}"
}
```

`cargo mutants` es la herramienta de referencia para producción. Como en los
demás ejemplos, `examples/rust-notes-cli` usa en su lugar un mutador propio sin
dependencias (`tools/mutate.rs`, `"mutate": "cargo build --quiet --bin mutate &&
./target/debug/mutate {{target}}"`) para ser autocontenido y determinista en CI.

### Java — ver `.harness/adapters/java.md`

```json
"commands": {
  "lint":   "mvn -q checkstyle:check",
  "test":   "mvn -q test",
  "mutate": "mvn -q org.pitest:pitest-maven:mutationCoverage -DtargetClasses={{target}}"
}
```

## Portar a un stack nuevo (checklist)

1. Copia `harness.config.json` y rellena `commands` con los de tu stack.
2. Asegura que `commands.test` sale con código 0 solo si todos los tests pasan.
3. Elige un mutador y ponlo en `commands.mutate` (debe salir != 0 bajo umbral).
4. Ajusta `paths` si tu layout no usa `src/`/`tests/`.
5. `bin/harness init` en verde → listo.

Los adaptadores documentados están en `.harness/adapters/`: `python.md`,
`node.md`, `go.md`, `rust.md`, `java.md` y el genérico `generic.md`.
