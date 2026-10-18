# Flujo de trabajo (legado)

> **Legado.** El pipeline por fases (spec → Gherkin → puerta sobre el `.feature` → TDD → juez → mutación, con un agente por fase) está retirado y sus agentes, borrados. Este fichero se conserva solo porque `bin/harness init` aún comprueba que exista.

La política vigente es la «Política de trabajo» del final de `AGENTS.md`: niveles (trivial, pequeño, estándar, crítico), dos puntos de aprobación humana (el plan antes de implementar y el diff en local antes de empujar) y delegación por capacidad (`frontier`, `balanced`, `fast`; qué modelo es cada uno: `docs/modelos.md`).

Qué leer según lo que necesites:

- Escribir criterios de aceptación: `docs/gherkin.md`
- Escribir el código y sus tests: `docs/tdd.md`
- Demostrar que funciona y cuándo está hecho: `docs/verification.md`
- Validar que los tests muerden: `docs/mutation-testing.md`
- Agentes de nivel, especialistas y dónde se verifica: `docs/tooling.md`
