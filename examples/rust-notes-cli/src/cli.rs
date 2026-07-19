//! Despacho de subcomandos y contrato observable de la CLI. Espeja `cli.go` /
//! `cli.py`: cada comando recibe los flujos de salida/error como parámetros para
//! poder capturarlos en los tests sin tocar `stdout`/`stderr` globales, y la ruta
//! del almacén se inyecta (nada de leer variables de entorno aquí dentro).
//!
//! Contrato de errores uniforme: los errores de dominio van a `err` y devuelven
//! código de salida 1; la salida útil va a `out`.

use crate::notes::{new_note, Note};
use crate::storage::{load, save};
use std::io::Write;

const DEFAULT_RECENT_LIMIT: i64 = 5;
const DATE_LEN: usize = 10; // "YYYY-MM-DD"

/// Despacha el subcomando y devuelve el código de salida. `now` es el
/// `created_at` ya formateado (lo inyecta `main.rs`); solo `add` lo usa.
pub fn run(args: &[String], path: &str, now: &str, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    if args.is_empty() {
        let _ = writeln!(err, "uso: notes <add|list|count|recent|since> ...");
        return 1;
    }
    let rest = &args[1..];
    match args[0].as_str() {
        "add" => cmd_add(rest, path, now, out, err),
        "list" => cmd_list(path, out, err),
        "count" => cmd_count(path, out, err),
        "recent" => cmd_recent(rest, path, out, err),
        "since" => cmd_since(rest, path, out, err),
        other => {
            let _ = writeln!(err, "comando desconocido: {:?}", other);
            1
        }
    }
}

/// Formato compartido por list/recent/since: `<id>\t<created_at>\t<title>`.
fn print_lines(out: &mut dyn Write, notes: &[Note]) {
    for n in notes {
        let _ = writeln!(out, "{}\t{}\t{}", n.id, n.created_at, n.title);
    }
}

/// Ordena de más reciente a más antigua por `created_at`, in place.
///
/// Nota didáctica: el ejemplo Go escribía el comparador con `>` explícito, lo que
/// producía un mutante *equivalente* (`>` vs `>=` dan el mismo orden sobre claves
/// distintas) que había que marcar con `// mutate: skip`. La forma idiomática en
/// Rust —`slice::sort_by` con `Ord::cmp`— no tiene ningún operador de comparación
/// que mutar, así que aquí **no hace falta** el pragma: no hay mutante equivalente
/// que silenciar. El mutador sí soporta `// mutate: skip` (ver `tools/mutate.rs`).
fn sort_desc(notes: &mut [Note]) {
    notes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
}

fn cmd_add(rest: &[String], path: &str, now: &str, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    if rest.is_empty() {
        let _ = writeln!(err, "add requiere un título");
        return 1;
    }
    let mut existing = match load(path) {
        Ok(v) => v,
        Err(e) => {
            let _ = writeln!(err, "{}", e);
            return 1;
        }
    };
    let note = new_note(rest[0].clone(), String::new(), &existing, now.to_string());
    let id = note.id;
    existing.push(note);
    if let Err(e) = save(&existing, path) {
        let _ = writeln!(err, "{}", e);
        return 1;
    }
    let _ = writeln!(out, "id={}", id);
    0
}

fn cmd_list(path: &str, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let notes = match load(path) {
        Ok(v) => v,
        Err(e) => {
            let _ = writeln!(err, "{}", e);
            return 1;
        }
    };
    print_lines(out, &notes);
    0
}

fn cmd_count(path: &str, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let notes = match load(path) {
        Ok(v) => v,
        Err(e) => {
            let _ = writeln!(err, "{}", e);
            return 1;
        }
    };
    let _ = writeln!(out, "{}", notes.len());
    0
}

fn cmd_recent(rest: &[String], path: &str, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let mut limit = DEFAULT_RECENT_LIMIT;
    if !rest.is_empty() {
        if rest[0] != "--limit" {
            let _ = writeln!(err, "argumento desconocido: {:?}", rest[0]);
            return 1;
        }
        if rest.len() < 2 {
            let _ = writeln!(err, "--limit requiere un valor");
            return 1;
        }
        match rest[1].parse::<i64>() {
            Ok(v) => limit = v,
            Err(_) => {
                let _ = writeln!(err, "--limit debe ser un entero");
                return 1;
            }
        }
    }
    if limit <= 0 {
        let _ = writeln!(err, "--limit debe ser un entero positivo");
        return 1;
    }
    let mut notes = match load(path) {
        Ok(v) => v,
        Err(e) => {
            let _ = writeln!(err, "{}", e);
            return 1;
        }
    };
    sort_desc(&mut notes);
    notes.truncate(limit as usize);
    print_lines(out, &notes);
    0
}

fn cmd_since(rest: &[String], path: &str, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    if rest.is_empty() {
        let _ = writeln!(err, "since requiere una fecha YYYY-MM-DD");
        return 1;
    }
    let date = &rest[0];
    if !valid_date(date) {
        let _ = writeln!(err, "fecha inválida: {:?} (formato esperado YYYY-MM-DD)", date);
        return 1;
    }
    let notes = match load(path) {
        Ok(v) => v,
        Err(e) => {
            let _ = writeln!(err, "{}", e);
            return 1;
        }
    };
    let mut matches: Vec<Note> = notes
        .into_iter()
        .filter(|n| note_date(&n.created_at) >= date.as_str())
        .collect();
    sort_desc(&mut matches);
    print_lines(out, &matches);
    0
}

/// Parte de fecha (`YYYY-MM-DD`) de un `created_at` ISO 8601.
fn note_date(created_at: &str) -> &str {
    &created_at[..DATE_LEN]
}

/// Valida una fecha `YYYY-MM-DD`: longitud y separadores exactos, dígitos en el
/// resto, mes en 1..=12 y día en 1..=31.
///
/// Alcance deliberado (a diferencia de Go, que usa `time.Parse`): es una
/// comprobación de rango, no un calendario completo, para mantener el validador
/// sin dependencias y pequeño. Rechaza formato inválido (`2026/05/01`) y rangos
/// imposibles (`2026-13-40`), pero NO detecta días imposibles de un mes concreto
/// (p. ej. `2026-02-30` se acepta). Un proyecto real usaría `chrono`/`time`.
fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != DATE_LEN {
        return false;
    }
    if b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    for (i, byte) in b.iter().enumerate() {
        if i == 4 || i == 7 {
            continue;
        }
        if !byte.is_ascii_digit() {
            return false;
        }
    }
    let month: u32 = s[5..7].parse().unwrap();
    let day: u32 = s[8..10].parse().unwrap();
    month >= 1 && month <= 12 && day >= 1 && day <= 31
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    const NOW: &str = "2026-06-15T12:00:00Z";

    struct Store {
        path: std::path::PathBuf,
    }

    impl Store {
        fn new() -> Store {
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let mut dir = std::env::temp_dir();
            dir.push(format!("rust-notes-cli-{}-{}", std::process::id(), n));
            std::fs::create_dir_all(&dir).unwrap();
            Store {
                path: dir.join("notas.json"),
            }
        }

        fn path(&self) -> &str {
            self.path.to_str().unwrap()
        }

        /// Siembra notas escribiendo el JSON directamente, sin pasar por `save`,
        /// para que el sembrado sea independiente de la capa que a veces se muta.
        fn seed(&self, notes: &[Note]) {
            std::fs::write(&self.path, crate::json::to_json(notes)).unwrap();
        }

        fn seed_raw(&self, raw: &[u8]) {
            std::fs::write(&self.path, raw).unwrap();
        }
    }

    fn note(id: u64, date: &str, title: &str) -> Note {
        Note {
            id,
            title: title.to_string(),
            body: String::new(),
            created_at: format!("{}T10:00:00Z", date),
        }
    }

    /// Ejecuta `run` capturando (código, stdout, stderr).
    fn run_cli(store: &Store, args: &[&str]) -> (i32, String, String) {
        let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let mut out: Vec<u8> = Vec::new();
        let mut err: Vec<u8> = Vec::new();
        let code = run(&args, store.path(), NOW, &mut out, &mut err);
        (
            code,
            String::from_utf8(out).unwrap(),
            String::from_utf8(err).unwrap(),
        )
    }

    fn lines(s: &str) -> Vec<&str> {
        s.trim_end_matches('\n')
            .split('\n')
            .filter(|l| !l.is_empty())
            .collect()
    }

    // ---- dispatcher --------------------------------------------------------

    #[test]
    fn no_subcommand_is_error() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &[]);
        assert_eq!(code, 1);
        assert!(err.contains("uso:"));
    }

    #[test]
    fn unknown_command_is_error() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &["bogus"]);
        assert_eq!(code, 1);
        assert!(err.contains("desconocido"));
    }

    // ---- count -------------------------------------------------------------

    #[test]
    fn count_empty_store_is_zero() {
        let s = Store::new();
        let (code, out, _) = run_cli(&s, &["count"]);
        assert_eq!(code, 0);
        assert_eq!(out, "0\n");
    }

    #[test]
    fn count_three_notes() {
        let s = Store::new();
        s.seed(&[
            note(1, "2026-05-01", "a"),
            note(2, "2026-05-02", "b"),
            note(3, "2026-05-03", "c"),
        ]);
        let (code, out, _) = run_cli(&s, &["count"]);
        assert_eq!(code, 0);
        assert_eq!(out, "3\n");
    }

    // ---- add / list --------------------------------------------------------

    #[test]
    fn first_add_gets_id_one_and_persists() {
        let s = Store::new();
        let (code, out, _) = run_cli(&s, &["add", "hola"]);
        assert_eq!(code, 0);
        assert_eq!(out, "id=1\n");
        let (_, out, _) = run_cli(&s, &["count"]);
        assert_eq!(out, "1\n");
    }

    #[test]
    fn add_is_sequential() {
        let s = Store::new();
        run_cli(&s, &["add", "primera"]);
        let (code, out, _) = run_cli(&s, &["add", "segunda"]);
        assert_eq!(code, 0);
        assert_eq!(out, "id=2\n");
    }

    #[test]
    fn add_uses_injected_created_at() {
        let s = Store::new();
        run_cli(&s, &["add", "hola"]);
        let (_, out, _) = run_cli(&s, &["list"]);
        assert_eq!(out, format!("1\t{}\thola\n", NOW));
    }

    #[test]
    fn add_requires_a_title() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &["add"]);
        assert_eq!(code, 1);
        assert!(err.contains("título"));
    }

    #[test]
    fn list_format_is_id_date_title() {
        let s = Store::new();
        s.seed(&[note(1, "2026-05-01", "alfa"), note(2, "2026-05-02", "beta")]);
        let (code, out, _) = run_cli(&s, &["list"]);
        assert_eq!(code, 0);
        assert_eq!(
            lines(&out),
            vec!["1\t2026-05-01T10:00:00Z\talfa", "2\t2026-05-02T10:00:00Z\tbeta"]
        );
    }

    // ---- recent ------------------------------------------------------------

    fn many_notes(n: u64) -> Vec<Note> {
        (1..=n)
            .map(|i| note(i, &format!("2026-05-0{}", i), &format!("t{}", i)))
            .collect()
    }

    #[test]
    fn recent_default_caps_at_five() {
        let s = Store::new();
        s.seed(&many_notes(7));
        let (code, out, _) = run_cli(&s, &["recent"]);
        assert_eq!(code, 0);
        let got = lines(&out);
        assert_eq!(got.len(), 5);
        assert!(got[0].starts_with("7\t2026-05-07T10:00:00Z"));
        assert!(got[4].starts_with("3\t2026-05-03T10:00:00Z"));
    }

    #[test]
    fn recent_is_descending() {
        let s = Store::new();
        s.seed(&[
            note(1, "2026-05-01", "a"),
            note(2, "2026-05-03", "c"),
            note(3, "2026-05-02", "b"),
        ]);
        let (_, out, _) = run_cli(&s, &["recent"]);
        let got = lines(&out);
        assert_eq!(got.len(), 3);
        assert!(got[0].starts_with("2\t2026-05-03"));
        assert!(got[2].starts_with("1\t2026-05-01"));
    }

    #[test]
    fn recent_custom_limit() {
        let s = Store::new();
        s.seed(&many_notes(4));
        let (code, out, _) = run_cli(&s, &["recent", "--limit", "2"]);
        assert_eq!(code, 0);
        assert_eq!(lines(&out).len(), 2);
    }

    #[test]
    fn recent_limit_one_succeeds() {
        let s = Store::new();
        s.seed(&many_notes(3));
        let (code, out, _) = run_cli(&s, &["recent", "--limit", "1"]);
        assert_eq!(code, 0);
        assert_eq!(lines(&out).len(), 1);
    }

    #[test]
    fn recent_limit_zero_fails() {
        let s = Store::new();
        s.seed(&many_notes(3));
        let (code, _, err) = run_cli(&s, &["recent", "--limit", "0"]);
        assert_eq!(code, 1);
        assert!(err.contains("positivo"));
    }

    #[test]
    fn recent_limit_missing_value_fails() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &["recent", "--limit"]);
        assert_eq!(code, 1);
        assert!(err.contains("valor"));
    }

    #[test]
    fn recent_limit_non_integer_fails() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &["recent", "--limit", "abc"]);
        assert_eq!(code, 1);
        assert!(err.contains("entero"));
    }

    #[test]
    fn recent_unknown_arg_fails() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &["recent", "5"]);
        assert_eq!(code, 1);
        assert!(err.contains("desconocido"));
    }

    #[test]
    fn recent_empty_store_is_silent() {
        let s = Store::new();
        let (code, out, _) = run_cli(&s, &["recent"]);
        assert_eq!(code, 0);
        assert_eq!(out, "");
    }

    // ---- since -------------------------------------------------------------

    fn since_store() -> Store {
        let s = Store::new();
        s.seed(&[
            Note {
                id: 1,
                title: "abril".to_string(),
                body: String::new(),
                created_at: "2026-04-30T10:00:00Z".to_string(),
            },
            Note {
                id: 2,
                title: "mayo-uno-tarde".to_string(),
                body: String::new(),
                created_at: "2026-05-01T23:00:00Z".to_string(),
            },
            Note {
                id: 3,
                title: "mayo-dos".to_string(),
                body: String::new(),
                created_at: "2026-05-02T09:00:00Z".to_string(),
            },
        ]);
        s
    }

    #[test]
    fn since_boundary_is_inclusive() {
        let s = since_store();
        let (code, out, _) = run_cli(&s, &["since", "2026-05-01"]);
        assert_eq!(code, 0);
        let got = lines(&out);
        assert_eq!(got.len(), 2);
        assert!(got[0].starts_with("3\t2026-05-02"));
        assert!(got[1].starts_with("2\t2026-05-01T23:00:00Z"));
        assert!(!out.contains("2026-04-30"));
    }

    #[test]
    fn since_no_matches_is_silent() {
        let s = since_store();
        let (code, out, _) = run_cli(&s, &["since", "2026-06-01"]);
        assert_eq!(code, 0);
        assert_eq!(out, "");
    }

    #[test]
    fn since_empty_store_is_silent() {
        let s = Store::new();
        let (code, out, _) = run_cli(&s, &["since", "2026-05-01"]);
        assert_eq!(code, 0);
        assert_eq!(out, "");
    }

    #[test]
    fn since_descending_order() {
        let s = Store::new();
        s.seed(&[
            note(1, "2026-05-01", "a"),
            note(2, "2026-05-03", "c"),
            note(3, "2026-05-02", "b"),
        ]);
        let (_, out, _) = run_cli(&s, &["since", "2026-05-01"]);
        let got = lines(&out);
        assert_eq!(got.len(), 3);
        assert!(got[0].starts_with("2\t2026-05-03"));
        assert!(got[2].starts_with("1\t2026-05-01"));
    }

    #[test]
    fn since_requires_a_date() {
        let s = Store::new();
        let (code, _, err) = run_cli(&s, &["since"]);
        assert_eq!(code, 1);
        assert!(err.contains("fecha"));
    }

    #[test]
    fn since_invalid_format_fails() {
        let s = since_store();
        let (code, _, err) = run_cli(&s, &["since", "2026/05/01"]);
        assert_eq!(code, 1);
        assert!(err.contains("inválida"));
    }

    #[test]
    fn since_out_of_range_date_fails() {
        let s = since_store();
        let (code, _, err) = run_cli(&s, &["since", "2026-13-40"]);
        assert_eq!(code, 1);
        assert!(err.contains("inválida"));
    }

    // ---- validador de fecha (unidad, para acorralar cada rama) --------------

    #[test]
    fn valid_date_accepts_boundaries() {
        assert!(valid_date("2026-05-01"));
        assert!(valid_date("2026-01-01")); // mes y día mínimos
        assert!(valid_date("2026-12-31")); // mes y día máximos
    }

    #[test]
    fn valid_date_rejects_bad_length() {
        assert!(!valid_date("2026-05-1"));
        assert!(!valid_date("2026-05-011"));
    }

    #[test]
    fn valid_date_rejects_wrong_separators() {
        assert!(!valid_date("2026/05/01"));
        assert!(!valid_date("2026-05/01"));
        assert!(!valid_date("2026x05-01"));
    }

    #[test]
    fn valid_date_rejects_non_digits() {
        assert!(!valid_date("2026-0a-01"));
        assert!(!valid_date("20x6-05-01"));
    }

    #[test]
    fn valid_date_rejects_out_of_range_month() {
        assert!(!valid_date("2026-00-01")); // mes 0
        assert!(!valid_date("2026-13-01")); // mes 13
    }

    #[test]
    fn valid_date_rejects_out_of_range_day() {
        assert!(!valid_date("2026-05-00")); // día 0
        assert!(!valid_date("2026-05-32")); // día 32
    }

    // ---- caminos de error de E/S -------------------------------------------

    #[test]
    fn commands_fail_on_corrupt_store() {
        let s = Store::new();
        s.seed_raw(b"{{ esto no es json");
        for args in [
            vec!["list"],
            vec!["count"],
            vec!["recent"],
            vec!["since", "2026-05-01"],
            vec!["add", "hola"],
        ] {
            let (code, _, _) = run_cli(&s, &args);
            assert_eq!(code, 1, "esperaba código 1 para {:?}", args);
        }
    }

    #[test]
    fn add_fails_when_save_cannot_write() {
        let s = Store::new();
        // Ruta cuyo directorio padre no existe: load la trata como vacía, pero
        // save no puede crear el temporal -> add devuelve 1.
        let deep = s.path.parent().unwrap().join("no-existe").join("notas.json");
        let args = vec!["add".to_string(), "hola".to_string()];
        let mut out: Vec<u8> = Vec::new();
        let mut err: Vec<u8> = Vec::new();
        let code = run(&args, deep.to_str().unwrap(), NOW, &mut out, &mut err);
        assert_eq!(code, 1);
    }
}
