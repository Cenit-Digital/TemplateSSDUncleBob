# Configuración — cómo adaptar el arnés a cualquier stack

> La política de trabajo (`AGENTS.md`: niveles, puerta humana, delegación) y los agentes son **fijos**. Lo único que cambia por proyecto son los comandos de tu stack, declarados en `harness.config.json`. Eso hace a la plantilla agnóstica al lenguaje.

## El motor

`.harness/harness.mjs` es un motor de **cero dependencias** (stdlib de Node ≥ 18). Lee `harness.config.json` del directorio actual y ejecuta los comandos que declaras. Se invoca con:

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
  "standalone": true,             // false = hereda el arnés raíz (sub-proyecto)
  "commands": {
    "install": "…",               // opcional
    "lint":    "…",               // vacío = se omite
    "test":    "…",               // sale 0 si todo pasa
    "mutate":  "…",               // sale != 0 si no supera el umbral
    "build":   "…"                // opcional
  },
  "paths": {                       // solo si tu layout difiere de los defaults
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

- `feature_list.json` y `progress/` ya **no son obligatorios**: si faltan, `init` los omite; `feature_list.json`, si existe, se valida.
- Las dos primeras `rules` actúan sobre las features de `feature_list.json` (sin él no hacen nada). `require_tests_to_close` y `require_mutation_to_close` rigen `verify`: con `true` y el comando vacío, `verify` aborta; pon `require_mutation_to_close` a `false` si tu proyecto no cierra por mutación.

### Tokens en `commands`

- `{{py}}` → el intérprete de Python disponible (`python3` o `python`).
- `{{target}}` → en `commands.mutate`, el módulo a mutar. Con `bin/harness mutate <target>`, ese único módulo; sin argumento (o con `bin/harness verify`) el motor **itera `mutation.targets`** y solo da verde si todos superan el umbral. Con `mutation.targets` vacía se ejecuta el comando tal cual (mutadores que cubren todo el proyecto, p. ej. Stryker).

## Recetas por stack

Los adaptadores por lenguaje están en `.harness/adapters/` (`python.md`, `node.md`, `go.md`, `rust.md`, `java.md` y el genérico `generic.md`); algunos aún mencionan mutadores propios de unos ejemplos que ya no existen: usa la herramienta estándar de tu stack. Las de referencia:

```json
// Node / TypeScript (Vitest + Stryker + ESLint)
"commands": { "install": "pnpm install", "lint": "eslint . && tsc --noEmit",
              "test": "vitest run", "mutate": "stryker run", "build": "vite build" }

// Go
"commands": { "lint": "go vet ./...", "test": "go test ./...",
              "mutate": "gremlins unleash {{target}} --dry-run=false" }

// Rust
"commands": { "lint": "cargo clippy -- -D warnings", "test": "cargo test",
              "mutate": "cargo mutants --file {{target}}" }

// Java
"commands": { "lint": "mvn -q checkstyle:check", "test": "mvn -q test",
              "mutate": "mvn -q org.pitest:pitest-maven:mutationCoverage -DtargetClasses={{target}}" }
```

Para Python, una herramienta de mutación de tu elección (por ejemplo `mutmut` o `cosmic-ray`); `python.md` y `node.md` explican cómo declarar `test` para cada stack.

## Portar a un stack nuevo

1. Copia `harness.config.json` y rellena `commands` con los de tu stack.
2. Asegura que `commands.test` sale con código 0 solo si todos los tests pasan.
3. Elige un mutador y ponlo en `commands.mutate` (debe salir != 0 bajo umbral).
4. Ajusta `paths` si tu layout no usa `src/`/`tests/`.
5. `bin/harness init` en verde → listo.
