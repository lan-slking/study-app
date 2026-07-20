import { createClient } from '@supabase/supabase-js'
import { authenticate } from '../server/requireAuth.js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  if (req.method === 'DELETE') {
    if (!serviceRoleKey) {
      console.error('Manjka SUPABASE_SERVICE_ROLE_KEY v okolju — brisanje računa ni mogoče.')
      return res.status(500).json({ error: 'Brisanje računa trenutno ni mogoče.' })
    }

    // Deleting the auth.users row (only possible with the service role key,
    // never the anon key used elsewhere in server/db.js) cascades to
    // profiles/notes/activity per their "on delete cascade" foreign keys.
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await admin.auth.admin.deleteUser(auth.user.id)
    if (error) {
      console.error('Failed to delete user:', error)
      return res.status(500).json({ error: 'Računa ni bilo mogoče izbrisati.' })
    }
    return res.status(204).end()
  }

  res.setHeader('Allow', 'DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
