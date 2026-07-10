// Interfaz de línea de comandos. Cero dependencias.
import * as storage from './storage.mjs';
import { createNote, NoteError, NoteNotFound } from './notes.mjs';

/** IO por defecto: escribe a los streams reales del proceso. */
const defaultIo = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
};

/** Extrae el valor de una opción `--name valor` de una lista de args. */
function getOption(args, name) {
  const i = args.indexOf(name);
  if (i === -1) {
    return null;
  }
  return args[i + 1] ?? '';
}

function cmdAdd(args, io) {
  const title = args[0];
  if (title === undefined) {
    throw new NoteError('add requiere un título');
  }
  const body = getOption(args, '--body') ?? '';
  const notes = storage.load();
  const note = createNote(title, body, notes);
  notes.push({ id: note.id, title: note.title, body: note.body, createdAt: note.createdAt });
  storage.save(notes);
  io.out(`id=${note.id}\n`);
  return 0;
}

function cmdList(args, io) {
  const notes = storage.load();
  for (const n of notes) {
    io.out(`${n.id}\t${n.createdAt}\t${n.title}\n`);
  }
  return 0;
}

function cmdShow(args, io) {
  const id = parseId(args[0]);
  const notes = storage.load();
  const note = notes.find((n) => n.id === id);
  if (note === undefined) {
    throw new NoteNotFound(`no existe la nota con id=${id}`);
  }
  io.out(`${note.title}\n${note.createdAt}\n${note.body}\n`);
  return 0;
}

function cmdDelete(args, io) {
  const id = parseId(args[0]);
  const notes = storage.load();
  const remaining = notes.filter((n) => n.id !== id);
  if (remaining.length === notes.length) {
    throw new NoteNotFound(`no existe la nota con id=${id}`);
  }
  storage.save(remaining);
  io.out(`borrada id=${id}\n`);
  return 0;
}

function cmdCount(args, io) {
  const notes = storage.load();
  io.out(`${notes.length}\n`);
  return 0;
}

function parseId(raw) {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new NoteError(`id inválido: "${raw ?? ''}"`);
  }
  return Number(raw);
}

const COMMANDS = {
  add: cmdAdd,
  list: cmdList,
  show: cmdShow,
  delete: cmdDelete,
  count: cmdCount,
};

/**
 * Punto de entrada del CLI.
 * @param {string[]} argv  argumentos sin el nombre del programa
 * @param {{out:(s:string)=>void, err:(s:string)=>void}} [io]
 * @returns {number} código de salida
 */
export function main(argv, io = defaultIo) {
  const [command, ...rest] = argv;
  const handler = COMMANDS[command];
  if (handler === undefined) {
    io.err(`comando desconocido: "${command ?? ''}"\n`);
    return 2;
  }
  try {
    return handler(rest, io);
  } catch (err) {
    if (err instanceof NoteError) {
      io.err(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
}
