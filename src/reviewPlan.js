import { computeMastery } from './mastery.js'

// Simple review plan, in two parts:
//
// - A note WITH a test date follows fixed checkpoints at 7, 4, 2, 1, and 0
//   days before the test — spacing reviews further apart early on and
//   closer together as the test nears, per standard spaced-repetition
//   practice.
// - A note WITHOUT a test date still gets reviewed, on an interval based on
//   its mastery score (mastery.js): never studied or weak (<50%) comes back
//   tomorrow, medium (<80%) every 3 days, strong every 7 — so the app keeps
//   inviting you back even when nothing's on the calendar, instead of only
//   ever nudging you toward an upcoming exam.
//
// Intentionally simple in both cases (fixed checkpoints/intervals, no
// per-note ease factor like a real SRS) — a starting point to refine later.
const CHECKPOINT_DAYS_BEFORE_TEST = [7, 4, 2, 1, 0]
const NEVER_STUDIED_INTERVAL_DAYS = 0
const WEAK_INTERVAL_DAYS = 1
const MEDIUM_INTERVAL_DAYS = 3
const STRONG_INTERVAL_DAYS = 7
const WEAK_MASTERY_THRESHOLD = 50
const MEDIUM_MASTERY_THRESHOLD = 80

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS)
}

// SQLite's datetime('now') shape ("YYYY-MM-DD HH:MM:SS", UTC) as a Date.
function parseSqliteTimestamp(value) {
  return new Date(value.replace(' ', 'T') + 'Z')
}

// Days remaining until a "YYYY-MM-DD" test date (negative if it's passed),
// or null if no test date is set.
export function daysUntilTest(testDate, today = new Date()) {
  if (!testDate) return null
  return daysBetween(new Date(`${testDate}T00:00:00`), today)
}

function reviewedToday(note, today) {
  if (!note.last_reviewed_at) return false
  return daysBetween(today, parseSqliteTimestamp(note.last_reviewed_at)) === 0
}

function reviewIntervalDays(mastery) {
  if (mastery === null) return NEVER_STUDIED_INTERVAL_DAYS
  if (mastery < WEAK_MASTERY_THRESHOLD) return WEAK_INTERVAL_DAYS
  if (mastery < MEDIUM_MASTERY_THRESHOLD) return MEDIUM_INTERVAL_DAYS
  return STRONG_INTERVAL_DAYS
}

function isDueByMastery(note, today) {
  if (!note.last_reviewed_at) return true
  const daysSinceReviewed = daysBetween(today, parseSqliteTimestamp(note.last_reviewed_at))
  return daysSinceReviewed >= reviewIntervalDays(computeMastery(note))
}

// Lower mastery first — notes you know least surface first. Never-studied
// notes (mastery === null) sort ahead of any real percentage, since they're
// the most urgent.
function sortWeight(note) {
  const mastery = computeMastery(note)
  return mastery === null ? -1 : mastery
}

// Returns the subset of `notes` that should be reviewed today, weakest
// first — either due at a test-date checkpoint, or due by the mastery-based
// interval for notes with no test date. Skips anything already reviewed
// today and anything with no content yet (nothing to review).
export function computeTodaysReview(notes, today = new Date()) {
  return notes
    .filter((note) => note.content && note.content.trim())
    .filter((note) => !reviewedToday(note, today))
    .filter((note) => {
      if (note.test_date) {
        return CHECKPOINT_DAYS_BEFORE_TEST.includes(daysUntilTest(note.test_date, today))
      }
      return isDueByMastery(note, today)
    })
    .sort((a, b) => sortWeight(a) - sortWeight(b))
}

// "še 5 dni" style countdown label for a Domov card, or null once the test
// date has passed (stale info isn't worth showing).
export function formatDaysUntilTest(days) {
  if (days === null || days < 0) return null
  if (days === 0) return 'danes!'
  if (days === 1) return 'jutri'
  return `še ${days} dni`
}
