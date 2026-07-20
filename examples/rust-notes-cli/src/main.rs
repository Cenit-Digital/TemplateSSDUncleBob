//! Pegamento de entorno (fuera de la prueba de mutación): traduce argumentos,
//! variable de entorno y reloj del sistema en una llamada a `notes::cli::run`.
//!
//! Toda la lógica de dominio (y por tanto los mutantes que hay que matar) vive en
//! la librería `notes`. Aquí solo se resuelve:
//!   - la ruta del almacén (`NOTES_FILE`, o `.notes.json` por defecto),
//!   - el `created_at` de una nota nueva (instante actual en ISO 8601, UTC),
//!   - y el volcado del código de salida.

use notes::cli;
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let path = std::env::var("NOTES_FILE").unwrap_or_else(|_| ".notes.json".to_string());
    let now = now_rfc3339();
    let code = cli::run(&args, &path, &now, &mut io::stdout(), &mut io::stderr());
    std::process::exit(code);
}

/// Instante actual en formato `YYYY-MM-DDThh:mm:ssZ` (UTC), sin dependencias.
///
/// Convierte los segundos desde la época a fecha civil con el algoritmo de
/// Howard Hinnant (`civil_from_days`). Es pegamento de entorno: no lo cubre la
/// prueba de mutación (un proyecto real usaría `chrono`/`time`).
fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (hh, mm, ss) = (rem / 3_600, (rem % 3_600) / 60, rem % 60);

    // civil_from_days: días desde 1970-01-01 -> (año, mes, día).
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hh, mm, ss
    )
}
