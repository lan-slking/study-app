// Fuzzy matching for fill-in-the-blank answers — lets "minor typos" through
// without accepting a genuinely different word. Simple on purpose: exact
// Levenshtein edit distance with a tolerance that scales with answer length,
// no dictionary or language-specific logic.
export function normalizeAnswer(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function levenshteinDistance(a, b) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      currentRow.push(Math.min(currentRow[j - 1] + 1, previousRow[j] + 1, previousRow[j - 1] + cost))
    }
    previousRow = currentRow
  }
  return previousRow[b.length]
}

// How many edits to tolerate for a correct answer of a given length — very
// short answers require an exact match (a single typo there often spells a
// genuinely different word), longer ones tolerate more.
function toleranceFor(length) {
  if (length <= 4) return 0
  if (length <= 9) return 1
  return 2
}

export function isAnswerCorrect(userAnswer, correctAnswer) {
  const normalizedUser = normalizeAnswer(userAnswer)
  const normalizedCorrect = normalizeAnswer(correctAnswer)
  if (!normalizedUser) return false
  if (normalizedUser === normalizedCorrect) return true

  const distance = levenshteinDistance(normalizedUser, normalizedCorrect)
  return distance <= toleranceFor(normalizedCorrect.length)
}
