// Formats a SQLite "YYYY-MM-DD HH:MM:SS" (UTC) timestamp as a Slovenian
// relative-time string, bucketed by calendar day so it never grows into an
// absurd raw day count.
const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function formatRelativeDate(sqliteTimestamp) {
  if (!sqliteTimestamp) return ''

  const then = new Date(sqliteTimestamp.replace(' ', 'T') + 'Z')
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(then)) / DAY_MS)

  if (dayDiff <= 0) return 'danes'
  if (dayDiff === 1) return 'včeraj'
  if (dayDiff < 7) return `pred ${dayDiff} dnevi`

  const weeks = Math.floor(dayDiff / 7)
  if (weeks === 1) return 'pred 1 tednom'
  if (weeks < 4) return `pred ${weeks} tedni`

  const months = Math.floor(dayDiff / 30)
  if (months <= 1) return 'pred 1 mesecem'
  if (months < 12) return `pred ${months} meseci`

  const years = Math.floor(dayDiff / 365)
  return years <= 1 ? 'pred 1 letom' : `pred ${years} leti`
}
