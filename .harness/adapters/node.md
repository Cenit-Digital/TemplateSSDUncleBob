# Adaptador: Node / TypeScript

## Cero dependencias (Node ≥ 18) — ver `examples/node-notes-cli`

```json
{
  "language": "node",
  "commands": {
    "test": "node --test",
    "mutate": "node tools/mutate.mjs {{target}}"
  },
  "mutation": { "threshold": 1.0, "targets": ["src/cli.mjs", "src/notes.mjs", "src/storage.mjs"] }
}
```

- Tests con el runner integrado `node --test` (Node 18+), sin instalar nada.
- Mutador propio `tools/mutate.mjs`: enmascara strings/comentarios, muta
  operadores/palabras/números/`return`, valida con `node --check`, respeta el
  pragma `// mutate: skip` para mutantes equivalentes.
- El ejemplo tiene 29 tests y mutación 100% en los 3 módulos.

## Producción: TypeScript + Vitest + StrykerJS

Es el stack que usa la web corporativa que inspiró esta plantilla:

```json
{
  "language": "node",
  "commands": {
    "install": "pnpm install",
    "lint": "eslint . && tsc --noEmit",
    "test": "vitest run",
    "mutate": "stryker run",
    "build": "vite build"
  }
}
```

- Mutación con [StrykerJS](https://stryker-mutator.io/) y
  `@stryker-mutator/vitest-runner`; umbral en `stryker.config.json`.
- Requiere `pnpm install`; añade la allowlist de comandos en
  `.claude/settings.json` si tu agente los usa a menudo.
