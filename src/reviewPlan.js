// Simple spaced-repetition review plan: for notes with a set test date,
// schedule review checkpoints at 7, 4, 2, 1, and 0 days before the test —
// spacing reviews further apart early on and closer together as the test
// nears, per standard spaced-repetition practice. Intentionally simple
// (fixed checkpoints, no per-note difficulty adjustment) — a starting point
// to refine later, not a full SRS algorithm.
const CHECKPOINT_DAYS_BEFORE_TEST = [7, 4, 2, 1, 0]
const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetween(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS)
}

// Days remaining until a "YYYY-MM-DD" test date (negative if it's passed),
// or null if no test date is set.
export function daysUntilTest(testDate, today = new Date()) {
  if (!testDate) return null
  return daysBetween(new Date(`${testDate}T00:00:00`), today)
}

function reviewedToday(note, today) {
  if (!note.last_reviewed_at) return false
  const reviewed = new Date(note.last_reviewed_at.replace(' ', 'T') + 'Z')
  return daysBetween(today, reviewed) === 0
}

// Lower score first — notes doing worse on their last quiz are prioritized.
// A note with no quiz attempt yet is treated as worst-case, so it surfaces
// too rather than being silently skipped.
function scoreRatio(note) {
  if (!Number.isInteger(note.last_quiz_total) || note.last_quiz_total === 0) return 0
  return note.last_quiz_correct / note.last_quiz_total
}

// Returns the subset of `notes` that should be reviewed today, weakest
// (lowest last quiz score) first. Only considers notes with a test date —
// this is deliberately a "test prep" plan, not a general recency reminder.
export function computeTodaysReview(notes, today = new Date()) {
  return notes
    .filter((note) => note.test_date)
    .filter((note) => {
      const remaining = daysUntilTest(note.test_date, today)
      return CHECKPOINT_DAYS_BEFORE_TEST.includes(remaining) && !reviewedToday(note, today)
    })
    .sort((a, b) => scoreRatio(a) - scoreRatio(b))
}

// "še 5 dni" style countdown label for a Domov card, or null once the test
// date has passed (stale info isn't worth showing).
export function formatDaysUntilTest(days) {
  if (days === null || days < 0) return null
  if (days === 0) return 'danes!'
  if (days === 1) return 'jutri'
  return `še ${days} dni`
}
