import { authenticate } from '../../server/requireAuth.js'
import { searchProfiles } from '../../server/db.js'

// Type-ahead search for the "share with this person" picker — see
// src/Zapiski.jsx. Profiles are otherwise only readable by their own owner
// (see supabase/migrations/20260717_add_profiles_and_avatars.sql), so this
// goes through the search_profiles RPC instead of a normal table query.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const query = typeof req.query.q === 'string' ? req.query.q : ''
  if (query.trim().length < 2) return res.json([])

  const results = await searchProfiles(auth.db, query.trim())
  return res.json(results)
}
