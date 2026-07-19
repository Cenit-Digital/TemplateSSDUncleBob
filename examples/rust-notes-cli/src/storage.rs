//! Capa de almacenamiento: lectura y escritura **atómica** de las notas en un
//! único archivo JSON. Espeja `storage.go` / `storage.py`.
//!
//! La escritura es atómica (temporal en el mismo directorio + `rename`): el
//! archivo nunca queda a medias si el proceso muere a mitad de escritura.

use crate::json;
use crate::notes::Note;
use std::fs;
use std::io::ErrorKind;

/// Lee las notas del archivo `path`. Si el archivo no existe devuelve una lista
/// vacía (no es un error: "aún no hay notas" es un estado válido). Un archivo
/// ilegible o con JSON corrupto sí es un error.
pub fn load(path: &str) -> Result<Vec<Note>, String> {
    match fs::read_to_string(path) {
        Ok(data) => json::from_json(&data),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("no pude leer {}: {}", path, e)),
    }
}

/// Escribe las notas en `path` de forma atómica: primero a un temporal contiguo
/// y luego `rename` sobre el destino. Si el `rename` falla, limpia el temporal.
pub fn save(notes: &[Note], path: &str) -> Result<(), String> {
    let data = json::to_json(notes);
    let tmp = format!("{}.tmp", path);
    fs::write(&tmp, data.as_bytes()).map_err(|e| format!("no pude escribir {}: {}", tmp, e))?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("no pude renombrar sobre {}: {}", path, e));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Directorio temporal único por caso (los tests corren en paralelo).
    fn temp_dir() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let mut p = std::env::temp_dir();
        p.push(format!("rust-notes-storage-{}-{}", std::process::id(), n));
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn note(id: u64) -> Note {
        Note {
            id,
            title: format!("nota {}", id),
            body: String::new(),
            created_at: "2026-05-01T10:00:00Z".to_string(),
        }
    }

    #[test]
    fn load_missing_file_is_empty_not_error() {
        let dir = temp_dir();
        let path = dir.join("no-existe.json");
        let got = load(path.to_str().unwrap()).unwrap();
        assert_eq!(got, Vec::<Note>::new());
    }

    #[test]
    fn load_corrupt_file_is_error() {
        let dir = temp_dir();
        let path = dir.join("corrupto.json");
        fs::write(&path, b"{{ esto no es json").unwrap();
        assert!(load(path.to_str().unwrap()).is_err());
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = temp_dir();
        let path = dir.join("notas.json");
        let notes = vec![note(1), note(2)];
        save(&notes, path.to_str().unwrap()).unwrap();
        assert_eq!(load(path.to_str().unwrap()).unwrap(), notes);
    }

    #[test]
    fn save_leaves_no_temp_file_behind() {
        let dir = temp_dir();
        let path = dir.join("notas.json");
        save(&[note(1)], path.to_str().unwrap()).unwrap();
        let tmp = format!("{}.tmp", path.to_str().unwrap());
        assert!(!std::path::Path::new(&tmp).exists());
    }

    #[test]
    fn save_fails_when_directory_does_not_exist() {
        let dir = temp_dir();
        let path = dir.join("sub").join("no-existe").join("notas.json");
        assert!(save(&[note(1)], path.to_str().unwrap()).is_err());
    }
}
