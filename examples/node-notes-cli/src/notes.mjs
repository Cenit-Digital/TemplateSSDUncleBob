// Modelo de dominio: la Nota. Cero dependencias.

/** Error base del dominio. */
export class NoteError extends Error {}

/** Se lanza cuando se busca una nota inexistente. */
export class NoteNotFound extends NoteError {}

/**
 * Crea una nota nueva e inmutable con id incremental.
 * @param {string} title
 * @param {string} body
 * @param {Array<{id:number}>} existing  notas ya existentes
 * @param {string} [createdAt]  ISO 8601; por defecto, ahora
 * @returns {{id:number, title:string, body:string, createdAt:string}}
 */
export function createNote(title, body, existing, createdAt) {
  const maxId = existing.reduce((max, n) => Math.max(max, n.id), 0);
  return Object.freeze({
    id: maxId + 1,
    title,
    body,
    createdAt: createdAt || new Date().toISOString(),
  });
}
