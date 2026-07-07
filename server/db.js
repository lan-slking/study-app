// A minimal SQLite data layer using sql.js (SQLite compiled to WebAssembly).
// We use sql.js instead of a native module (like better-sqlite3) because it
// needs no C++ build tools — it just works anywhere Node runs.
//
// The catch: sql.js keeps the whole database in memory. To make notes
// actually survive a restart, we load the .sqlite file from disk on startup
// and write it back to disk after every change (see persist() below).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data.sqlite");

let db;

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Must be called once at server startup, before any of the functions below.
export async function initDb() {
  const SQL = await initSqlJs();

  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  persist();
}

export function getAllNotes() {
  const stmt = db.prepare("SELECT * FROM notes ORDER BY updated_at DESC");
  const notes = [];
  while (stmt.step()) {
    notes.push(stmt.getAsObject());
  }
  stmt.free();
  return notes;
}

export function getNoteById(id) {
  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  stmt.bind([id]);
  const note = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return note;
}

export function createNote({ title, content }) {
  db.run("INSERT INTO notes (title, content) VALUES (?, ?)", [title, content]);

  const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();

  persist();
  return getNoteById(id);
}

export function updateNote(id, { title, content }) {
  db.run(
    "UPDATE notes SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?",
    [title, content, id],
  );
  persist();
  return getNoteById(id);
}

export function deleteNote(id) {
  db.run("DELETE FROM notes WHERE id = ?", [id]);
  persist();
}
