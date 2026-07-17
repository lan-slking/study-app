import { authenticate } from '../server/requireAuth.js'
import { getStreak } from '../server/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  return res.json({ streak: await getStreak(auth.db) })
}
