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
  // Cached Gemini-generated study content, keyed to whatever `content` was
  // current when generated. Null means "not generated yet" — the quiz/
  // flashcards/fill-blank endpoints fall back to generating on demand when
  // empty, so pre-generation is a pure optimization, never a hard dependency.
  if (!existingColumns.includes("quiz_json")) {
    db.run("ALTER TABLE notes ADD COLUMN quiz_json TEXT");
  }
  if (!existingColumns.includes("flashcards_json")) {
    db.run("ALTER TABLE notes ADD COLUMN flashcards_json TEXT");
  }
  if (!existingColumns.includes("fill_blank_json")) {
    db.run("ALTER TABLE notes ADD COLUMN fill_blank_json TEXT");
  }
  // Optional user-set exam date ("YYYY-MM-DD") driving the countdown badge
  // and review plan on Domov, and when this note was last actually studied
  // (any quiz/flashcards/dopolnjevanje session) — see the activity table
  // below, which last_reviewed_at is a denormalized shortcut for.
  if (!existingColumns.includes("test_date")) {
    db.run("ALTER TABLE notes ADD COLUMN test_date TEXT");
  }
  if (!existingColumns.includes("last_reviewed_at")) {
    db.run("ALTER TABLE notes ADD COLUMN last_reviewed_at TEXT");
  }
  // A random token that makes a note readable (and quiz-able) via the public
  // /api/shared/:token routes without authentication — null until the owner
  // first clicks "Deli". Sharing never exposes anything but this one note.
  if (!existingColumns.includes("share_token")) {
    db.run("ALTER TABLE notes ADD COLUMN share_token TEXT");
  }
  // Last result per study mode — mirrors last_quiz_correct/total, which
  // originally only tracked Kviz. Together the three pairs feed mastery.js's
  // blended "how well do you know this" score, so Kartončki and
  // Dopolnjevanje sessions count toward it too, not just Kviz.
  if (!existingColumns.includes("last_flashcards_correct")) {
    db.run("ALTER TABLE notes ADD COLUMN last_flashcards_correct INTEGER");
  }
  if (!existingColumns.includes("last_flashcards_total")) {
    db.run("ALTER TABLE notes ADD COLUMN last_flashcards_total INTEGER");
  }
  if (!existingColumns.includes("last_fill_blank_correct")) {
    db.run("ALTER TABLE notes ADD COLUMN last_fill_blank_correct INTEGER");
  }
  if (!existingColumns.includes("last_fill_blank_total")) {
    db.run("ALTER TABLE notes ADD COLUMN last_fill_blank_total INTEGER");
  }

  // One row per completed study session (quiz / flashcards / fill_blank),
  // across all notes. Powers the Domov streak (distinct days with at least
  // one row) and could later inform a richer review plan than the simple
  // last_reviewed_at/last_quiz_* shortcut on notes currently uses.
  db.run(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      correct INTEGER,
      total INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  persist();
}

export function getNoteByShareToken(token) {
  const stmt = db.prepare("SELECT * FROM notes WHERE share_token = ?");
  stmt.bind([token]);
  const note = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return note;
}

export function setShareToken(id, token) {
  db.run("UPDATE notes SET share_token = ? WHERE id = ?", [token, id]);
  persist();
  return getNoteById(id);
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

export function createNote({ title, content, subject = "", mode = "", testDate = null }) {
  db.run("INSERT INTO notes (title, content, subject, mode, test_date) VALUES (?, ?, ?, ?, ?)", [
    title,
    content,
    subject,
    mode,
    testDate,
  ]);

  const idStmt = db.prepare("SELECT last_insert_rowid() AS id");
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();

  persist();
  return getNoteById(id);
}

// Quiz/flashcards/fill-blank results are updated exclusively through
// logActivity below (POST .../activity) now — a single path that also logs
// history and bumps last_reviewed_at, instead of this general-purpose
// update silently accepting a score with none of that.
export function updateNote(id, { title, content, subject, testDate }) {
  const existing = getNoteById(id);
  if (!existing) return null;

  db.run(
    `UPDATE notes SET title = ?, content = ?, subject = ?, test_date = ?, updated_at = datetime('now') WHERE id = ?`,
    [
      title !== undefined ? title : existing.title,
      content !== undefined ? content : existing.content,
      subject !== undefined ? subject : existing.subject,
      testDate !== undefined ? testDate : existing.test_date,
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

// Partial update for the cached study-content columns — only overwrites the
// keys present in `updates` (e.g. quiz_json), so one generation failing
// (see Promise.allSettled in index.js) doesn't wipe out a sibling cache that
// succeeded. Keys are the raw column names, matching getNoteById's shape.
export function updateGeneratedContent(id, updates) {
  const existing = getNoteById(id);
  if (!existing) return null;

  db.run(
    "UPDATE notes SET quiz_json = ?, flashcards_json = ?, fill_blank_json = ? WHERE id = ?",
    [
      updates.quiz_json !== undefined ? updates.quiz_json : existing.quiz_json,
      updates.flashcards_json !== undefined ? updates.flashcards_json : existing.flashcards_json,
      updates.fill_blank_json !== undefined ? updates.fill_blank_json : existing.fill_blank_json,
      id,
    ],
  );
  persist();
  return getNoteById(id);
}

// Clears all cached study content — called when a note's content actually
// changes, so a stale quiz/flashcards/fill-blank set is never served as if
// it matched the current text.
export function invalidateGeneratedContent(id) {
  db.run("UPDATE notes SET quiz_json = NULL, flashcards_json = NULL, fill_blank_json = NULL WHERE id = ?", [id]);
  persist();
}

// Records one completed study session and bumps the note's last-reviewed
// timestamp — this is what "a day counts toward the streak" and "has this
// note been reviewed today" (see reviewPlan.js) are both based on.
// Maps an activity type to the note columns that track its most recent
// result — used so logActivity can update the right pair below without a
// separate call per study mode (see mastery.js, which reads these back).
const ACTIVITY_SCORE_COLUMNS = {
  quiz: ["last_quiz_correct", "last_quiz_total"],
  flashcards: ["last_flashcards_correct", "last_flashcards_total"],
  fill_blank: ["last_fill_blank_correct", "last_fill_blank_total"],
};

export function logActivity(noteId, { type, correct, total }) {
  db.run("INSERT INTO activity (note_id, type, correct, total) VALUES (?, ?, ?, ?)", [
    noteId,
    type,
    correct ?? null,
    total ?? null,
  ]);

  const scoreColumns = ACTIVITY_SCORE_COLUMNS[type];
  if (scoreColumns) {
    const [correctColumn, totalColumn] = scoreColumns;
    db.run(
      `UPDATE notes SET last_reviewed_at = datetime('now'), ${correctColumn} = ?, ${totalColumn} = ? WHERE id = ?`,
      [correct ?? null, total ?? null, noteId],
    );
  } else {
    db.run("UPDATE notes SET last_reviewed_at = datetime('now') WHERE id = ?", [noteId]);
  }
  persist();
}

// Current daily streak: the number of consecutive calendar days (counting
// back from today) with at least one logged activity. A gap of even one day
// breaks it. Computed fresh from the activity log each time rather than
// stored as a mutable counter, so it can never drift out of sync.
export function getStreak() {
  const stmt = db.prepare(`
    SELECT DISTINCT date(created_at) AS day FROM activity ORDER BY day DESC
  `);
  const days = [];
  while (stmt.step()) {
    days.push(stmt.getAsObject().day);
  }
  stmt.free();

  if (days.length === 0) return 0;

  const toDate = (isoDay) => new Date(`${isoDay}T00:00:00Z`);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // The most recent activity must be today or yesterday for the streak to
  // still be "alive" — otherwise it's already broken (0), not just stale.
  const mostRecentGapDays = Math.round((todayUtc - toDate(days[0])) / oneDayMs);
  if (mostRecentGapDays > 1) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((toDate(days[i - 1]) - toDate(days[i])) / oneDayMs);
    if (gap === 1) {
      streak++;
    } else if (gap > 1) {
      break;
    }
    // gap === 0 shouldn't happen (DISTINCT), but would just continue.
  }
  return streak;
}
