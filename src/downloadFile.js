// Triggers a browser download of in-memory text content — no server round
// trip, no integrations, just a file the browser saves.
export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Keeps a note title usable as a filename across platforms — strips
// characters Windows/macOS/Linux all disallow and caps the length.
export function slugifyFilename(title) {
  return (title || 'snov').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'snov'
}

function csvEscape(value) {
  const str = String(value ?? '')
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

// term;definition per line — the format Anki and Quizlet both accept for a
// basic two-field import.
export function buildFlashcardsCsv(cards) {
  return cards.map((card) => `${csvEscape(card.term)};${csvEscape(card.definition)}`).join('\n')
}
