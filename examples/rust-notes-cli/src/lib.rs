//! Ejemplo de referencia del arnés SSD "Uncle Bob" para Rust: una CLI de notas
//! minimalista y **sin dependencias**.
//!
//! El grueso de los tests unitarios vive junto al código, en un módulo
//! `#[cfg(test)]` dentro de cada `.rs` (la convención de Rust), igual que Go
//! coloca los `*_test.go` junto al paquete. La lógica de dominio está en estos
//! módulos; el pegamento de entorno (argumentos, reloj, flujos estándar) vive en
//! `main.rs`, que queda fuera de la prueba de mutación a propósito.

pub mod cli;
pub mod json;
pub mod notes;
pub mod storage;
