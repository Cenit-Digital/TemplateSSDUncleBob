# Convenciones de código

> Homogeneidad extrema. La IA predice mejor cuando el repositorio se parece a
> sí mismo en todas partes. Define aquí las convenciones de TU stack; los
> agentes las siguen al pie de la letra.

## Principios (agnósticos)

- **Un formateador y un linter fijos**, declarados en `harness.config.json`
  (`commands.lint`). El código se entrega formateado; el linter no da avisos.
- **Nombres consistentes** por tipo (módulos, tipos, funciones, constantes,
  privados). Elige una convención por categoría y no la mezcles.
- **Estructura de archivo homogénea**: mismo orden de imports, mismas
  cabeceras, mismos patrones de export.
- **Manejo de errores uniforme**: un tipo/base de error de dominio; la capa
  de interfaz captura, informa por el canal de error y sale con código != 0.
  Nunca propagar stack traces crudos al usuario.
- **Comentarios: solo el *por qué* no obvio.** Los nombres hacen el resto. Sin
  comentarios decorativos ni obviedades.
- **Tests co-locados o en `tests/`**, uno por módulo, con nombres
  descriptivos que digan qué comportamiento verifican.

## Ejemplos concretos (referencia)

| Stack     | Formato/Lint         | Tests            | Ver                              |
| --------- | -------------------- | ---------------- | -------------------------------- |
| Python    | PEP 8, líneas ≤ 100  | `unittest`       | `examples/python-notes-cli`      |
| Node/TS   | ESLint + Prettier    | `node --test`    | `examples/node-notes-cli`        |
| Node/TS (web) | ESLint 9 flat + Prettier | Vitest + TL | El repo WebEmpresa que inspiró la plantilla |

## Rellena: convenciones de tu proyecto

- **Lenguaje / versión:** …
- **Formato / línea máxima:** …
- **Convención de nombres:** …
- **Orden de imports:** …
- **Errores de dominio:** …
