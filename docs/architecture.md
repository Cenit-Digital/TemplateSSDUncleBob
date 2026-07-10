# Arquitectura — Qué significa "hacer un buen trabajo"

> Este documento define el estándar de calidad de TU proyecto. Los agentes
> revisores (`judge`) evalúan el código contra este archivo. **Si no está
> aquí, no es un requisito.** Rellénalo al arrancar el proyecto.

## Principios (agnósticos, ajústalos a tu stack)

1. **Capas claras y pocas.** Define las capas de tu proyecto y no introduzcas
   más (servicios, repositorios, ORMs, capas de abstracción) hasta que haya
   una razón concreta documentada en `feature_list.json`. Los ejemplos usan
   tres capas: `storage` (persistencia) → `model` (dominio) → `cli`/`ui`
   (interfaz).

2. **Dependencias mínimas y justificadas.** Cada dependencia externa se
   discute antes de añadirla (estado `blocked` si hace falta debate). Los
   ejemplos son cero-dependencias a propósito.

3. **Errores explícitos.** Las funciones que pueden fallar lanzan excepciones
   nombradas (o devuelven un `Result`/error tipado en stacks que lo prefieran),
   no valores nulos silenciosos.

4. **Inmutabilidad por defecto.** El estado del dominio se modela inmutable;
   modificar = crear una nueva instancia.

5. **Atomicidad en disco / efectos controlados.** Toda escritura persistente
   se hace de forma atómica (temporal + rename). Nunca dejar el estado a
   medio escribir.

## Plantilla: define aquí las capas de tu proyecto

```
usuario  ─→  <capa de interfaz>
              │
              ├─ construye <modelo de dominio>
              │
              └─→  <capa de persistencia>
                       │
                       └─→  <almacén>
```

## Qué NO hacer (rellena con tus antipatrones)

- No mezclar IO con lógica de dominio.
- No leer/escribir el almacén dentro de un bucle: carga al inicio, modifica en
  memoria, guarda al final.
- No añadir sistemas de configuración prematuros.

> **Referencia:** `examples/python-notes-cli` y `examples/node-notes-cli`
> muestran una instancia concreta y completa de estos principios.
