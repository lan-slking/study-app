import { getSharedNoteByToken } from '../../../server/db.js'

// Public, read-only view opened from a "Deli" link — see src/SharedNote.jsx.
// Exposes only the shared note's title/content/subject, never the owner's
// other notes or activity.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const note = await getSharedNoteByToken(req.query.token)
  if (!note) return res.status(404).json({ error: 'Ta povezava ni veljavna.' })

  return res.json({ title: note.title, content: note.content, subject: note.subject })
}
