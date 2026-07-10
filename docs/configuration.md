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
- `{{target}}` → en `commands.mutate`, recibe el argumento que pases a
  `bin/harness mutate <target>`.

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

### Go

```json
"commands": {
  "lint":   "go vet ./...",
  "test":   "go test ./...",
  "mutate": "go test -run=xxx ./... # integra go-mutesting o gremlins"
}
```

## Portar a un stack nuevo (checklist)

1. Copia `harness.config.json` y rellena `commands` con los de tu stack.
2. Asegura que `commands.test` sale con código 0 solo si todos los tests pasan.
3. Elige un mutador y ponlo en `commands.mutate` (debe salir != 0 bajo umbral).
4. Ajusta `paths` si tu layout no usa `src/`/`tests/`.
5. `bin/harness init` en verde → listo.

Los adaptadores documentados están en `.harness/adapters/`.
