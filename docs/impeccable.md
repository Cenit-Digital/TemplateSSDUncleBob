# Diseño con Impeccable

> Toda interfaz del proyecto (web, componentes y pantallas nativas) se diseña y se revisa con la skill **Impeccable**
> (<https://github.com/pbakaus/impeccable>, Apache-2.0). Claude Design y la skill `frontend-design` están retirados.

## Qué trae la plantilla

| Ruta | Qué es |
| --- | --- |
| `.claude/skills/impeccable/` | La skill para Claude Code (`/impeccable …`), con su `LICENSE` y su `NOTICE.md` |
| `.agents/skills/impeccable/` | La misma skill para Codex |
| `.claude/agents/impeccable-*.md` | Los subagentes que la skill delega (revisión final, movimiento, documentación, recursos y ediciones manuales) |
| `.harness/impeccable-gate.mjs` | La puerta de la CI: el detector sobre las rutas web del proyecto |
| `.github/workflows/impeccable.yml` | El workflow «Diseño (Impeccable)», con su gemelo para los runners propios |

Todo es de plantilla en `harness.manifest.json`: `scripts/harness-upgrade.mjs --apply` lo pone al día. La versión está
fijada (la 4.10.0) en la puerta y en el front matter de los dos `SKILL.md`; se sube en la plantilla, nunca en un derivado.
Se instaló con:

```bash
npx impeccable@4.10.0 install -y --scope=project --providers=claude,codex --no-hooks
```

## Cómo se trabaja

1. **`/impeccable init`** una vez por proyecto: escribe `PRODUCT.md` (para quién es y qué tiene que conseguir) y
   `DESIGN.md` (el sistema de diseño: color, tipografía, espaciado, componentes). Los dos son del proyecto y se versionan.
   Las webs de una misma marca comparten su `DESIGN.md`; la web de un cliente usa el de su marca.
2. **`/impeccable shape`** antes de construir una pantalla nueva: deja el diseño acordado antes del código.
3. **`/impeccable critique`** y **`/impeccable audit`** al revisar: puntúan el resultado y listan lo que falla.
4. **`/impeccable polish`** antes de entregar. Si el cambio es visual, el PR lleva capturas de antes y después.

## La puerta de la CI

`node .harness/impeccable-gate.mjs` lee `ui.paths` de `harness.config.json`:

```json
"ui": { "paths": ["web/src"] }
```

- **Sin rutas:** el proyecto no tiene web. La puerta comprueba que la skill está instalada, lo dice y sale con 0.
- **Con rutas:** ejecuta `npx impeccable@4.10.0 detect --json --report-unused-ignores <rutas>` y exige que no salga
  **ninguna** entrada. Cuentan los hallazgos, los avisos («advisory», que el detector deja salir con 0) y los
  comentarios de excepción que ya no ignoran nada. Antes comprueba que cada ruta existe y tiene algo que analizar
  (una carpeta vacía saldría limpia sin mirar nada).
- **Códigos del detector**, comprobados con la 4.10.0: 0 sin hallazgos, 2 con hallazgos, 1 si no pudo escanear una ruta.
- **Salida de la puerta:** 0 limpio o sin web; 1 con hallazgos o si falla una comprobación; 2 si el detector no pudo
  escanear o la configuración es ilegible.

El workflow analiza el código fuente. Si el proyecto construye HTML (Astro, una web estática), puede pasar también la
salida en su propia CI, después del build: `npx impeccable@4.10.0 detect --report-unused-ignores dist/`.

## Hooks apagados

Los hooks de Impeccable (detector tras cada edición) van **apagados**: se instala con `--no-hooks`, la puerta falla si
`.claude/settings.json` o `.codex/hooks.json` traen uno, y `.impeccable/config.json`, si existe, lleva
`"hook": { "enabled": false }` (`/impeccable hooks off`). En Codex un hook exige aprobación manual y los agentes sin
interfaz no pueden darla; la verificación es la puerta de la CI. `.impeccable/config.local.json` es personal: va en
`.gitignore`.

## Excepciones

La regla es corregir. Una excepción solo vale para algo que no se puede cambiar, como la marca de un cliente, y lleva
su motivo escrito:

- **En el fichero:** `impeccable-disable-next-line <regla>: <motivo>` (o `impeccable-disable-line`, o
  `impeccable-disable <regla>` para el fichero entero) en el comentario del lenguaje. La puerta rechaza el comentario
  sin motivo, y el detector, el que ya no ignora nada.
- **En `.impeccable/config.json`:** solo `detector.ignoreValues` acotado por valor o por fichero, con `--reason`
  (`/impeccable hooks ignore-value …`). `detector.ignoreRules` y `detector.ignoreFiles` no se admiten: silencian una
  regla o un fichero entero, incluidas las reglas que aún no existen.
