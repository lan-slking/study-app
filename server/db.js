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

  // Added for the Home screen redesign (subject chips + last quiz score on
  // each card). Existing rows just pick up the column defaults.
  const existingColumns = db.exec("PRAGMA table_info(notes)")[0].values.map((row) => row[1]);
  if (!existingColumns.includes("subject")) {
    db.run("ALTER TABLE notes ADD COLUMN subject TEXT NOT NULL DEFAULT ''");
  }
  // last_quiz_score (a flat percentage) was replaced by correct/total below,
  // which can show a "6/8" fraction and drive a progress ring — a column left
  // over from an earlier pass is harmless and stays untouched if present.
  if (!existingColumns.includes("last_quiz_correct")) {
    db.run("ALTER TABLE notes ADD COLUMN last_quiz_correct INTEGER");
  }
  if (!existingColumns.includes("last_quiz_total")) {
    db.run("ALTER TABLE notes ADD COLUMN last_quiz_total INTEGER");
  }
  // Which prompt mode ("full" | "summary") produced this note's content —
  // shown on the Zapiski screen so the student remembers what they picked.
  if (!existingColumns.includes("mode")) {
    db.run("ALTER TABLE notes ADD COLUMN mode TEXT NOT NULL DEFAULT ''");
  }

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

export function createNote({ title, content, subject = "", mode = "" }) {
  db.run("INSERT INTO notes (title, content, subject, mode) VALUES (?, ?, ?, ?)", [title, content, subject, mode]);

  const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();

  persist();
  return getNoteById(id);
}

export function updateNote(id, { title, content, subject, lastQuizCorrect, lastQuizTotal }) {
  const existing = getNoteById(id);
  if (!existing) return null;

  db.run(
    `UPDATE notes SET title = ?, content = ?, subject = ?, last_quiz_correct = ?, last_quiz_total = ?,
     updated_at = datetime('now') WHERE id = ?`,
    [
      title !== undefined ? title : existing.title,
      content !== undefined ? content : existing.content,
      subject !== undefined ? subject : existing.subject,
      lastQuizCorrect !== undefined ? lastQuizCorrect : existing.last_quiz_correct,
      lastQuizTotal !== undefined ? lastQuizTotal : existing.last_quiz_total,
      id,
    ],
  );
  persist();
  return getNoteById(id);
}

export function deleteNote(id) {
  db.run("DELETE FROM notes WHERE id = ?", [id]);
  persist();
}
