// Blends the most recent result from each of the three study modes into one
// "how well do you know this note" score (0-100), instead of the Home ring
// only ever reflecting the last Kviz — Kartončki and Dopolnjevanje sessions
// count too. Simple average of whichever modes have been tried at least
// once; a mode never attempted just doesn't contribute (it doesn't drag the
// score toward 0). Returns null if the note has never been studied at all.
const SCORE_FIELDS = [
  ['last_quiz_correct', 'last_quiz_total'],
  ['last_flashcards_correct', 'last_flashcards_total'],
  ['last_fill_blank_correct', 'last_fill_blank_total'],
]

export function computeMastery(note) {
  const ratios = []
  for (const [correctField, totalField] of SCORE_FIELDS) {
    const total = note[totalField]
    if (Number.isInteger(total) && total > 0) {
      ratios.push(note[correctField] / total)
    }
  }
  if (ratios.length === 0) return null
  const average = ratios.reduce((sum, r) => sum + r, 0) / ratios.length
  return Math.round(average * 100)
}
