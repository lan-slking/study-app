// Fixed subject list matching the design reference — each has its own emoji
// and a dedicated CSS color token (see :root in App.css), rather than free
// text with a hashed color.
export const SUBJECTS = [
  { key: 'fizika', label: 'Fizika', emoji: '⚛️' },
  { key: 'matematika', label: 'Matematika', emoji: '📐' },
  { key: 'zgodovina', label: 'Zgodovina', emoji: '🏛️' },
  { key: 'kemija', label: 'Kemija', emoji: '🧪' },
  { key: 'biologija', label: 'Biologija', emoji: '🌱' },
  { key: 'slovenscina', label: 'Slovenščina', emoji: '📖' },
]

const FALLBACK = { key: '', label: '', emoji: '📄' }

export function subjectMeta(key) {
  const found = SUBJECTS.find((s) => s.key === key)
  return {
    ...(found || FALLBACK),
    color: found ? `var(--${found.key})` : 'var(--muted-foreground)',
  }
}
