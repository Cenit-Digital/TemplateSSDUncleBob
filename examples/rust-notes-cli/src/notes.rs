//! Modelo de dominio: una nota con id incremental, título, cuerpo y fecha de
//! creación en ISO 8601. Espeja `notes.go` / `notes.py` de los otros ejemplos.
//!
//! La conversión "instante del reloj -> cadena ISO 8601" **no** vive aquí: es
//! pegamento de entorno y se hace en `main.rs`. `new_note` recibe el `created_at`
//! ya formateado, igual que la capa de dominio recibe datos ya saneados. Así
//! este módulo es lógica pura, determinista y trivial de testear al 100%.

/// Una nota: id incremental, título, cuerpo y fecha de creación (ISO 8601, UTC).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Note {
    pub id: u64,
    pub title: String,
    pub body: String,
    pub created_at: String,
}

/// Siguiente id incremental. Las notas se guardan en orden de creación, así que
/// la última tiene el id mayor: el siguiente es ese más uno. Un almacén vacío
/// arranca en 1.
pub fn next_id(existing: &[Note]) -> u64 {
    match existing.last() {
        None => 1,
        Some(last) => last.id + 1,
    }
}

/// Construye una nota nueva: título, cuerpo, las notas existentes (para el id) y
/// el `created_at` ya formateado por el llamante.
pub fn new_note(title: String, body: String, existing: &[Note], created_at: String) -> Note {
    Note {
        id: next_id(existing),
        title,
        body,
        created_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(id: u64) -> Note {
        Note {
            id,
            title: "t".to_string(),
            body: String::new(),
            created_at: "2026-05-01T10:00:00Z".to_string(),
        }
    }

    #[test]
    fn next_id_on_empty_store_is_one() {
        assert_eq!(next_id(&[]), 1);
    }

    #[test]
    fn next_id_is_last_plus_one() {
        assert_eq!(next_id(&[note(5)]), 6);
    }

    #[test]
    fn next_id_uses_last_note_not_the_maximum() {
        // Ids a propósito no ascendentes: debe usar la ÚLTIMA nota, no el máximo.
        assert_eq!(next_id(&[note(9), note(3)]), 4);
    }

    #[test]
    fn new_note_assigns_next_id_and_copies_fields() {
        let existing = vec![note(1)];
        let n = new_note(
            "hola".to_string(),
            "cuerpo".to_string(),
            &existing,
            "2026-06-01T10:00:00Z".to_string(),
        );
        assert_eq!(n.id, 2);
        assert_eq!(n.title, "hola");
        assert_eq!(n.body, "cuerpo");
        assert_eq!(n.created_at, "2026-06-01T10:00:00Z");
    }
}
