const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const SESSION_KEY = 'piflar-auth-session'

function authHeaders() {
  return { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, 'Content-Type': 'application/json' }
}

async function authRequest(path, body) {
  const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Prijave ni bilo mogoče dokončati.')
  return data
}

function saveSession(session) {
  if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
}

// Supabase's confirmation link can return the session in the URL hash.
export function restoreSessionFromUrl() {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = hash.get('access_token')
  if (!accessToken) return getSession()
  const session = saveSession({ access_token: accessToken, refresh_token: hash.get('refresh_token'), token_type: hash.get('token_type') })
  window.history.replaceState({}, document.title, window.location.pathname)
  return session
}

export async function signUp(email, password, username) {
  const data = await authRequest('/signup', { email, password, data: { username } })
  const session = data.session ?? (data.access_token ? data : null)
  return { session: saveSession(session), user: data.user }
}

export async function signIn(email, password) {
  const session = saveSession(await authRequest('/token?grant_type=password', { email, password }))
  return session
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
}

// Decodes the current session's JWT to read the signed-in user's email,
// without a round trip to the server — mirrors profile.js's getCurrentUserId.
export function getSessionEmail() {
  const token = getSession()?.access_token
  if (!token) return null
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null } catch { return null }
}

// Self-service update against GoTrue's /user endpoint — unlike signUp/signIn,
// this is authenticated with the user's own access token, not the anon key.
async function updateUser(fields) {
  const token = getSession()?.access_token
  if (!token) throw new Error('Za nadaljevanje se prijavi.')
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Zahteve ni bilo mogoče dokončati.')
  return data
}

export function updateEmail(email) {
  return updateUser({ email })
}

export function updatePassword(password) {
  return updateUser({ password })
}
