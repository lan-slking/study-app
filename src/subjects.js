// The fixed set of common Slovenian school subjects, each with an emoji and
// a dedicated color token (see :root in App.css). Picking "Drugo" in the
// wizard reveals a text field for anything not on this list instead — see
// NovaSnov.jsx.
export const SUBJECTS = [
  { key: 'matematika', label: 'Matematika', emoji: '📐' },
  { key: 'fizika', label: 'Fizika', emoji: '⚛️' },
  { key: 'kemija', label: 'Kemija', emoji: '🧪' },
  { key: 'biologija', label: 'Biologija', emoji: '🌱' },
  { key: 'zgodovina', label: 'Zgodovina', emoji: '🏛️' },
  { key: 'geografija', label: 'Geografija', emoji: '🌍' },
  { key: 'slovenscina', label: 'Slovenščina', emoji: '📖' },
  { key: 'anglescina', label: 'Angleščina', emoji: '🇬🇧' },
  { key: 'nemscina', label: 'Nemščina', emoji: '🇩🇪' },
  { key: 'spanscina', label: 'Španščina', emoji: '🇪🇸' },
  { key: 'informatika', label: 'Informatika', emoji: '💻' },
  { key: 'psihologija', label: 'Psihologija', emoji: '🧠' },
  { key: 'sociologija', label: 'Sociologija', emoji: '👥' },
  { key: 'filozofija', label: 'Filozofija', emoji: '💭' },
  { key: 'ekonomija', label: 'Ekonomija', emoji: '📊' },
  { key: 'umetnost', label: 'Umetnost', emoji: '🎨' },
  { key: 'glasba', label: 'Glasba', emoji: '🎵' },
  { key: 'sport', label: 'Šport', emoji: '⚽' },
]

const CUSTOM_EMOJI = '📚'

// Deterministic hue for a custom (user-typed) subject, so the same name
// always gets the same color without needing to store a color anywhere —
// the subject's own name is its own color seed.
function hashHue(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

// Looks up display info for a subject key. Handles three cases: empty (no
// subject set), one of the fixed SUBJECTS, or a custom one — anything else
// is treated as a custom subject the user typed into "Drugo", using its raw
// text as both the key and the label.
export function subjectMeta(key) {
  if (!key) {
    return { key: '', label: '', emoji: '📄', color: 'var(--muted-foreground)' }
  }

  const found = SUBJECTS.find((s) => s.key === key || s.label.toLowerCase() === key.toLowerCase())
  if (found) {
    return { ...found, color: `var(--${found.key})` }
  }

  return { key, label: key, emoji: CUSTOM_EMOJI, color: `oklch(62% 0.1 ${hashHue(key.toLowerCase())})` }
}

// Custom subjects already in use, derived from existing notes rather than a
// separate stored list — a custom subject "exists" for the picker as long
// as at least one note currently uses it. Used so a custom subject shows up
// as a normal chip in the wizard next time, per subjectMeta's exact-match
// lookup above.
export function customSubjectsInUse(notes) {
  const officialKeys = new Set(SUBJECTS.map((s) => s.key))
  const seen = new Map()
  for (const note of notes) {
    if (note.subject && !officialKeys.has(note.subject) && !seen.has(note.subject)) {
      seen.set(note.subject, subjectMeta(note.subject))
    }
  }
  return [...seen.values()]
}

// Every distinct subject (official or custom) currently used by at least one
// note — powers the desktop sidebar's subject filter list.
export function subjectsInUse(notes) {
  const seen = new Map()
  for (const note of notes) {
    if (note.subject && !seen.has(note.subject)) {
      seen.set(note.subject, subjectMeta(note.subject))
    }
  }
  return [...seen.values()]
}
