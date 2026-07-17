import { authenticate } from '../../../server/requireAuth.js'
import { getNoteById, logActivity, getStreak } from '../../../server/db.js'

// Logs one completed study session (quiz / flashcards / fill_blank) — feeds
// the Domov streak and the "reviewed today" check in the review plan.
const ACTIVITY_TYPES = new Set(['quiz', 'flashcards', 'fill_blank'])

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const id = req.query.id
  if (!(await getNoteById(auth.db, id))) {
    return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })
  }

  const { type, correct, total } = req.body ?? {}
  if (!ACTIVITY_TYPES.has(type)) {
    return res.status(400).json({ error: 'Neveljavna vrsta dejavnosti.' })
  }

  await logActivity(auth.db, id, { type, correct, total })
  return res.status(201).json({ streak: await getStreak(auth.db) })
}
