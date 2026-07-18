# Review — feature `since` (go-notes-cli)

**Veredicto:** APPROVED

## Cobertura de escenarios (@s ↔ test)
- @s1: [x] `TestSinceInclusiveBoundary` (nota del día exacto a las 23:00 entra)
- @s2: [x] `TestSinceInclusiveBoundary` (04-30 fuera, 05-02 dentro)
- @s3: [x] `TestSinceDescendingOrder`
- @s4: [x] `TestSinceInclusiveBoundary` / `TestListFormat` (formato de línea)
- @s5: [x] `TestSinceInvalidFormat`
- @s6: [x] `TestSinceImpossibleDate`
- @s7: [x] `TestSinceNoMatches`
- @s8: [x] `TestSinceEmptyStore`

## Disciplina TDD
- ¿Producción sin test que la pida? NO
- ¿Evidencia de Rojo→Verde→Refactor? SÍ (progress/tdd_since.md)

## Calidad
- `cmdSince` es corta y de un solo motivo; valida la entrada antes de tocar el
  almacén y no lo modifica.
- Reutiliza `printLines` y `byCreatedAtDesc`: un único contrato de presentación
  y de orden, compartido con `recent`/`list`.

## Checkpoints
- C1..C7: [x]

APPROVED -> progress/judge_since.md
