import { getSession } from './auth.js'

// All private API calls carry the signed-in user's access token. The backend
// verifies it before reading or changing notes, activities, or generated work.
export async function apiFetch(input, init = {}) {
  const session = getSession()
  if (!session) throw new Error('Za nadaljevanje se prijavi.')

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${session.access_token}`)
  return fetch(input, { ...init, headers })
}
