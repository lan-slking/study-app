// A small fixed palette of friendly, distinguishable colors for subject chips.
// The same subject name always maps to the same color (a simple string hash),
// so there's no separate "pick a color" step when creating a subject.
const PALETTE = [
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
]

export function subjectColor(subject) {
  if (!subject) return '#9ca3af'

  let hash = 0
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 31 + subject.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
