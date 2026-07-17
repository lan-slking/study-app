import { authenticate } from '../../server/requireAuth.js'
import { getSharedNoteByToken, createNote, updateGeneratedContent } from '../../server/db.js'

// Imports a copy into the signed-in user's own account. The source is read
// through the token-scoped RPC; RLS then assigns the new row to the importer.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  if (!/^[a-f0-9]{24}$/i.test(token)) {
    return res.status(400).json({ error: 'Povezava za deljenje ni veljavna.' })
  }

  const source = await getSharedNoteByToken(token)
  if (!source) return res.status(404).json({ error: 'Ta deljena snov ne obstaja več.' })

  const note = await createNote(auth.db, {
    title: source.title,
    content: source.content,
    subject: source.subject,
    mode: 'shared',
  })
  if (source.quiz_json) await updateGeneratedContent(auth.db, note.id, { quiz_json: source.quiz_json })
  return res.status(201).json(note)
}
