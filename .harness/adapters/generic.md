# Adaptador genérico (cualquier stack)

El arnés no sabe de tu lenguaje: solo ejecuta los comandos que declaras. Para
cualquier stack no cubierto por un adaptador específico:

1. Copia `harness.config.json` y rellena `commands`:
   - `test` — debe salir con código 0 **solo** si todos los tests pasan.
   - `mutate` — debe salir != 0 si no supera el umbral de mutación.
   - `lint`, `build`, `install` — opcionales.
2. Ajusta `paths` si tu layout no usa `src/` / `tests/`.
3. `bin/harness init` en verde → listo.

## Ejemplos de comandos por stack

| Stack   | test                     | mutación (herramienta)                        |
| ------- | ------------------------ | --------------------------------------------- |
| Go      | `go test ./...`          | [gremlins](https://github.com/go-gremlins/gremlins) / go-mutesting |
| Rust    | `cargo test`             | [cargo-mutants](https://github.com/sourcefrog/cargo-mutants) |
| Java    | `mvn test`               | [PIT](https://pitest.org/)                    |
| C#/.NET | `dotnet test`            | [Stryker.NET](https://stryker-mutator.io/)    |
| PHP     | `phpunit`                | [Infection](https://infection.github.io/)     |
| Ruby    | `rspec`                  | [mutant](https://github.com/mbj/mutant)       |

## Si tu stack no tiene mutador maduro

Puedes portar el mutador de los ejemplos (Python/Node): son ~200 líneas sin
dependencias que mutan operadores, palabras clave, números y `return`, validan
que el mutante compile y restauran el original. Es un buen punto de partida.
