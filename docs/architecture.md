# Arquitectura — Qué significa "hacer un buen trabajo"

> Este documento define el **estándar de calidad** de *tu* proyecto: la vara
> contra la que el `judge` evalúa el código. Si un requisito no está aquí, no
> es un requisito. Si algo aquí se incumple, el juez rechaza.
>
> Es un archivo **que debes reescribir** con la arquitectura concreta de tu
> proyecto. Abajo tienes principios neutrales al stack (que casi siempre
> valen) y, al final, un ejemplo ilustrado con `examples/notes-cli`.

Este enfoque es coherente con la postura verificada de Robert C. Martin
sobre el código escrito por agentes: no revisarlo línea a línea, sino
**medir** cobertura de tests, estructura de dependencias, complejidad
ciclomática, tamaño de los módulos y prueba de mutación. Este documento es
donde declaras qué significan esas medidas *para tu proyecto*, para que el
juez pueda aplicarlas.

## Principios (neutrales al stack)

1. **Capas claras y mínimas.** Define las capas del proyecto y **solo**
   esas. Cada capa tiene una responsabilidad y una dirección de dependencia.
   No introduzcas capas adicionales (servicios, repositorios, ORMs,
   frameworks) hasta que haya una razón concreta documentada en
   `feature_list.json`.

2. **Sin dependencias no justificadas.** Prefiere la librería estándar del
   lenguaje. Si una feature necesita una dependencia externa, primero se
   **discute**: marca la feature como `blocked` en `feature_list.json` y
   argumenta el porqué antes de añadirla. Una dependencia es una decisión de
   arquitectura, no un detalle.

3. **Errores explícitos y nombrados.** Las funciones que pueden fallar (dato
   inexistente, entrada corrupta, permiso denegado) señalan el fallo de
   forma explícita —una excepción/tipo de error con nombre propio— en lugar
   de devolver un valor vacío o silencioso que el llamante pueda ignorar.

4. **Inmutabilidad por defecto donde aplique.** Los objetos de dominio son
   inmutables salvo que haya una razón para lo contrario. Modificar = crear
   una instancia nueva. Esto elimina toda una clase de bugs por estado
   compartido.

5. **Operaciones de IO atómicas.** Toda escritura a almacenamiento
   persistente se hace de forma que nunca deje el recurso a medio escribir
   (p. ej. escribir a un temporal y renombrar de forma atómica). Un fallo a
   mitad de operación no debe corromper datos.

6. **"Si no está aquí, no es un requisito."** El código que ningún requisito
   ni escenario pidió no debe existir. La arquitectura acota el alcance:
   simplifica la revisión y hace que la prueba de mutación tenga sentido.

## Cómo usar este archivo

1. Reemplaza la sección "Ejemplo" por la arquitectura **real** de tu
   proyecto: sus capas, su flujo de datos, y su lista de "qué NO hacer".
2. Sé concreto y verificable. Cada afirmación debería poder comprobarla el
   `judge` mirando el código.
3. Mantenlo corto. Este documento es un contrato de calidad, no un tutorial.

---

## Ejemplo (`examples/notes-cli`)

> Ilustrativo. Es la arquitectura del CLI de notas del ejemplo, no la de tu
> proyecto. Bórrala y pon la tuya.

**Capas (tres, y solo tres):**

- `storage.py` — persistencia (JSON en disco).
- `notes.py` — modelo de dominio (`Note`).
- `cli.py` — interfaz de usuario (argparse).

No se introducen capas adicionales hasta que haya una razón concreta
documentada en `feature_list.json`.

**Reglas concretas del ejemplo:**

- **Sin dependencias externas.** Solo stdlib de Python. Una dependencia
  nueva pasa antes por estado `blocked`.
- **Errores explícitos.** Las funciones que pueden fallar lanzan
  excepciones nombradas (`NoteError`, `NoteNotFound`), no devuelven `None`.
- **Inmutabilidad.** `Note` es un `@dataclass(frozen=True)`; modificar =
  crear una instancia nueva.
- **Atomicidad en disco.** Toda escritura a `notes.json` va primero a un
  temporal y luego `os.replace()`.

**Flujo de datos:**

```
usuario  ─→  cli.py (argparse)
              │
              ├─ construye Note con notes.Note.new(...)
              │
              └─→  storage.load() / storage.save()
                       │
                       └─→  .notes.json (en CWD)
```

**Qué NO hacer (en el ejemplo):**

- No usar `print()` para errores. Usa el flujo de error estándar y un código
  de salida distinto de 0.
- No mezclar IO con lógica de dominio dentro de `notes.py`.
- No leer/escribir el archivo en cada iteración de un bucle. Carga al
  inicio, modifica en memoria, guarda al final.
- No añadir un sistema de configuración. La ruta del archivo se pasa
  explícitamente o usa la constante por defecto.
