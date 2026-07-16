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
