import crypto from 'crypto'
import { authenticate } from '../../../server/requireAuth.js'
import { getNoteById, updateGeneratedContent } from '../../../server/db.js'

// A note's share link is stable once created (clicking "Deli" again returns
// the same token, not a new one) and is read-only — see api/shared/[token].
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const id = req.query.id
  const note = await getNoteById(auth.db, id)
  if (!note) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })

  const token = note.share_token || crypto.randomBytes(12).toString('hex')
  if (!note.share_token) await updateGeneratedContent(auth.db, id, { share_token: token })

  return res.json({ shareToken: token })
}
