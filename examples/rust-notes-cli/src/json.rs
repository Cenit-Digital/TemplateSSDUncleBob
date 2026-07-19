//! JSON mínimo y sin dependencias, especializado al esquema de `Note`.
//!
//! Rust no trae JSON en su stdlib (a diferencia de Python/Node/Go), así que el
//! ejemplo lo implementa a mano para conservar el "cero dependencias" del resto
//! de ejemplos. Es un parser recursivo-descendente que acepta EXACTAMENTE lo que
//! este programa escribe: un array de objetos planos cuyos valores son cadenas o
//! enteros sin signo, con las claves `id,title,body,created_at` **en ese orden**.
//! Cualquier otra cosa devuelve `Err`, que es justo lo que la capa de
//! almacenamiento necesita para detectar un archivo corrupto.
//!
//! Un proyecto Rust real usaría `serde_json`; aquí el objetivo es que el ejemplo
//! sea autocontenido y que la prueba de mutación tenga algo de dominio que morder.

use crate::notes::Note;

// ----------------------------------------------------------------------------
// Serialización
// ----------------------------------------------------------------------------

/// Serializa las notas a un array JSON. Cadenas escapadas; enteros pelados.
pub fn to_json(notes: &[Note]) -> String {
    let objs: Vec<String> = notes.iter().map(obj_to_json).collect();
    format!("[{}]", objs.join(","))
}

fn obj_to_json(note: &Note) -> String {
    format!(
        "{{\"id\":{},\"title\":{},\"body\":{},\"created_at\":{}}}",
        note.id,
        quote(&note.title),
        quote(&note.body),
        quote(&note.created_at)
    )
}

/// Envuelve `s` entre comillas dobles escapando `"`, `\` y el salto de línea.
fn quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

// ----------------------------------------------------------------------------
// Parsing
// ----------------------------------------------------------------------------

/// Parsea un array JSON de notas. Devuelve `Err` ante cualquier desviación del
/// esquema (incluido contenido sobrante tras el array).
pub fn from_json(input: &str) -> Result<Vec<Note>, String> {
    let mut p = Parser::new(input);
    p.skip_ws();
    let notes = p.parse_array()?;
    p.skip_ws();
    if !p.at_end() {
        return Err("contenido sobrante tras el array".to_string());
    }
    Ok(notes)
}

struct Parser {
    bytes: Vec<u8>,
    pos: usize,
}

impl Parser {
    fn new(input: &str) -> Parser {
        Parser {
            bytes: input.as_bytes().to_vec(),
            pos: 0,
        }
    }

    fn at_end(&self) -> bool {
        self.pos >= self.bytes.len()
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    /// Consume y devuelve el byte actual (avanzando el cursor). `None` al final.
    fn bump(&mut self) -> Option<u8> {
        let b = self.peek();
        if b.is_some() {
            self.pos += 1;
        }
        b
    }

    fn skip_ws(&mut self) {
        while let Some(b) = self.peek() {
            if b == b' ' || b == b'\n' || b == b'\t' || b == b'\r' {
                self.bump();
            } else {
                break;
            }
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), String> {
        if self.peek() == Some(byte) {
            self.bump();
            Ok(())
        } else {
            Err(format!("esperaba '{}' en la posición {}", byte as char, self.pos))
        }
    }

    fn parse_array(&mut self) -> Result<Vec<Note>, String> {
        self.expect(b'[')?;
        self.skip_ws();
        let mut notes = Vec::new();
        if self.peek() == Some(b']') {
            self.bump();
            return Ok(notes);
        }
        loop {
            let note = self.parse_object()?;
            notes.push(note);
            self.skip_ws();
            match self.bump() {
                Some(b',') => self.skip_ws(),
                Some(b']') => return Ok(notes),
                _ => return Err("esperaba ',' o ']' en el array".to_string()),
            }
        }
    }

    fn parse_object(&mut self) -> Result<Note, String> {
        self.expect(b'{')?;
        self.parse_key("id")?;
        let id = self.parse_number()?;
        self.expect_comma()?;
        self.parse_key("title")?;
        let title = self.parse_string()?;
        self.expect_comma()?;
        self.parse_key("body")?;
        let body = self.parse_string()?;
        self.expect_comma()?;
        self.parse_key("created_at")?;
        let created_at = self.parse_string()?;
        self.skip_ws();
        self.expect(b'}')?;
        Ok(Note {
            id,
            title,
            body,
            created_at,
        })
    }

    fn expect_comma(&mut self) -> Result<(), String> {
        self.skip_ws();
        self.expect(b',')
    }

    /// Consume `"<name>" :` (con espacios opcionales). Falla si la clave no es la
    /// esperada: el parser es estricto con el esquema.
    fn parse_key(&mut self, name: &str) -> Result<(), String> {
        self.skip_ws();
        let key = self.parse_string()?;
        if key != name {
            return Err(format!("esperaba la clave \"{}\", vino \"{}\"", name, key));
        }
        self.skip_ws();
        self.expect(b':')?;
        self.skip_ws();
        Ok(())
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.expect(b'"')?;
        let mut out: Vec<u8> = Vec::new();
        loop {
            match self.bump() {
                None => return Err("cadena sin cerrar".to_string()),
                Some(b'"') => break,
                Some(b'\\') => match self.bump() {
                    Some(b'"') => out.push(b'"'),
                    Some(b'\\') => out.push(b'\\'),
                    Some(b'n') => out.push(b'\n'),
                    _ => return Err("secuencia de escape inválida".to_string()),
                },
                Some(byte) => out.push(byte),
            }
        }
        String::from_utf8(out).map_err(|_| "cadena con UTF-8 inválido".to_string())
    }

    fn parse_number(&mut self) -> Result<u64, String> {
        let start = self.pos;
        while let Some(b) = self.peek() {
            if b.is_ascii_digit() {
                self.bump();
            } else {
                break;
            }
        }
        if self.pos == start {
            return Err("esperaba un número".to_string());
        }
        let digits = String::from_utf8(self.bytes[start..self.pos].to_vec()).unwrap();
        digits
            .parse::<u64>()
            .map_err(|_| "número fuera de rango".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(id: u64, title: &str, body: &str, created_at: &str) -> Note {
        Note {
            id,
            title: title.to_string(),
            body: body.to_string(),
            created_at: created_at.to_string(),
        }
    }

    #[test]
    fn serializes_empty_array() {
        assert_eq!(to_json(&[]), "[]");
    }

    #[test]
    fn serializes_a_note_with_exact_shape() {
        let n = note(1, "alfa", "", "2026-05-01T10:00:00Z");
        assert_eq!(
            to_json(&[n]),
            "[{\"id\":1,\"title\":\"alfa\",\"body\":\"\",\"created_at\":\"2026-05-01T10:00:00Z\"}]"
        );
    }

    #[test]
    fn serializes_two_notes_comma_separated() {
        let a = note(1, "a", "", "2026-05-01T00:00:00Z");
        let b = note(2, "b", "", "2026-05-02T00:00:00Z");
        assert_eq!(
            to_json(&[a, b]),
            "[{\"id\":1,\"title\":\"a\",\"body\":\"\",\"created_at\":\"2026-05-01T00:00:00Z\"},\
             {\"id\":2,\"title\":\"b\",\"body\":\"\",\"created_at\":\"2026-05-02T00:00:00Z\"}]"
        );
    }

    #[test]
    fn escapes_special_characters() {
        let n = note(1, "con \"comillas\" y \\barra", "línea1\nlínea2", "2026-05-01T00:00:00Z");
        let json = to_json(&[n.clone()]);
        // Round-trip: lo que serializo lo vuelvo a parsear idéntico.
        let back = from_json(&json).unwrap();
        assert_eq!(back, vec![n]);
    }

    #[test]
    fn parses_empty_array() {
        assert_eq!(from_json("[]").unwrap(), vec![]);
    }

    #[test]
    fn round_trip_preserves_all_fields() {
        let notes = vec![
            note(5, "único dígito", "cuerpo", "2026-05-01T23:00:00Z"),
            note(42, "otra", "", "2026-06-15T09:30:00Z"),
        ];
        let json = to_json(&notes);
        assert_eq!(from_json(&json).unwrap(), notes);
    }

    #[test]
    fn parses_unicode_titles() {
        let notes = vec![note(1, "café ☕ résumé", "", "2026-05-01T00:00:00Z")];
        let json = to_json(&notes);
        assert_eq!(from_json(&json).unwrap(), notes);
    }

    #[test]
    fn tolerates_insignificant_whitespace_everywhere() {
        // Espacio, salto de línea, tabulador y retorno de carro alrededor y dentro
        // del array: skip_ws debe tragárselos todos. Cubre cada rama de skip_ws.
        let input = " \n\t\r[ \n\t\r]\t\r\n ";
        assert_eq!(from_json(input).unwrap(), vec![]);
    }

    #[test]
    fn rejects_leading_comma_in_array() {
        assert!(from_json("[,]").is_err());
    }

    #[test]
    fn rejects_trailing_content_after_array() {
        let json = to_json(&[note(1, "a", "", "2026-05-01T00:00:00Z")]);
        let with_tail = format!("{} basura", json);
        assert!(from_json(&with_tail).is_err());
    }

    #[test]
    fn rejects_unterminated_string() {
        assert!(from_json("[{\"id\":1,\"title\":\"sin cerrar").is_err());
    }

    #[test]
    fn rejects_missing_number() {
        assert!(from_json("[{\"id\":,\"title\":\"a\"}]").is_err());
    }

    #[test]
    fn rejects_wrong_key_name() {
        assert!(from_json("[{\"nope\":1}]").is_err());
    }

    #[test]
    fn rejects_missing_comma_between_fields() {
        assert!(from_json("[{\"id\":1\"title\":\"a\"}]").is_err());
    }

    #[test]
    fn rejects_plain_garbage() {
        assert!(from_json("{{ esto no es json").is_err());
    }

    #[test]
    fn rejects_number_that_overflows_u64() {
        // 21 nueves: no cabe en u64 -> el parser debe fallar, no hacer panic.
        assert!(from_json("[{\"id\":999999999999999999999,\"title\":\"a\",\"body\":\"\",\"created_at\":\"x\"}]").is_err());
    }
}
