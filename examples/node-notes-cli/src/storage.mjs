// Persistencia atómica de notas en un archivo JSON. Cero dependencias.
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

let defaultPath = '.notes.json';

/** Ruta por defecto del almacén (mutable, para poder aislar en tests). */
export function getDefaultPath() {
  return defaultPath;
}

/** Cambia la ruta por defecto (los tests la apuntan a un directorio temporal). */
export function setDefaultPath(path) {
  defaultPath = path;
}

/**
 * Carga las notas. Devuelve [] si el archivo no existe.
 * @param {string} [path]
 * @returns {Array<object>}
 */
export function load(path = defaultPath) {
  if (!existsSync(path)) {
    return [];
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Guarda las notas de forma atómica (archivo temporal + rename). El JSON es
 * legible por humanos: UTF-8 y sangría de 2 espacios.
 * @param {Array<object>} notes
 * @param {string} [path]
 */
export function save(notes, path = defaultPath) {
  const directory = dirname(resolve(path));
  const tmp = join(directory, `.notes_${randomUUID()}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf8');
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      unlinkSync(tmp);
    }
    throw err;
  }
}
