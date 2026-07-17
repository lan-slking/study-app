import { databaseForRequest } from './db.js'

// Verifies the caller's Supabase JWT and returns a request-scoped db client
// (so every query is checked by RLS) plus the authenticated user, or null if
// the request isn't authenticated. Each Vercel function calls this itself and
// responds with 401 on null — there's no shared middleware chain here.
export async function authenticate(req) {
  try {
    const database = await databaseForRequest(req.headers.authorization)
    if (!database) return null
    return { db: database.client, user: database.user }
  } catch (err) {
    console.error('Authentication error:', err)
    return null
  }
}
