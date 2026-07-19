// Keeps a note title usable as a filename across platforms — strips
// characters Windows/macOS/Linux all disallow and caps the length.
export function slugifyFilename(title) {
  return (title || 'snov').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'snov'
}
