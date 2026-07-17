import { authenticate } from '../../server/requireAuth.js'
import { getAllNotes, createNote } from '../../server/db.js'

export default async function handler(req, res) {
  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  if (req.method === 'GET') {
    return res.json(await getAllNotes(auth.db))
  }

  if (req.method === 'POST') {
    const { title = '', content = '', subject = '', mode = '', testDate = null } = req.body ?? {}
    const note = await createNote(auth.db, { title, content, subject, mode, testDate })
    return res.status(201).json(note)
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
