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

// "še 5 dni" style countdown label for a Domov card, or null once the test
// date has passed (stale info isn't worth showing).
export function formatDaysUntilTest(days) {
  if (days === null || days < 0) return null
  if (days === 0) return 'danes!'
  if (days === 1) return 'jutri'
  return `še ${days} dni`
}
