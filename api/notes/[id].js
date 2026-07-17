import { authenticate } from '../../server/requireAuth.js'
import { getNoteById, updateNote, deleteNote, invalidateGeneratedContent } from '../../server/db.js'

export default async function handler(req, res) {
  if (req.headers['x-debug-route'] === '1') {
    return res.status(200).json({ url: req.url, method: req.method, query: req.query })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const id = req.query.id

  if (req.method === 'PUT') {
    const before = await getNoteById(auth.db, id)
    if (!before) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })

    const { title, content, subject, testDate } = req.body ?? {}
    let note = await updateNote(auth.db, id, { title, content, subject, testDate })
    if (!note) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })

    // The cached quiz/flashcards/fill-blank content was generated from the OLD
    // content — once it actually changes, invalidate it. It regenerates lazily
    // the next time the note's study modes are opened (see studyContent.js).
    if (content !== undefined && content !== before.content) {
      await invalidateGeneratedContent(auth.db, id)
      note = await getNoteById(auth.db, id)
    }

    return res.json(note)
  }

  if (req.method === 'DELETE') {
    await deleteNote(auth.db, id)
    return res.status(204).end()
  }

  res.setHeader('Allow', 'PUT, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
