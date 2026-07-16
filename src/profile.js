import { getSession } from './auth.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function userId() {
  const token = getSession()?.access_token
  if (!token) return null
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub } catch { return null }
}

function headers(extra = {}) {
  const token = getSession()?.access_token
  return { apikey: publishableKey, Authorization: `Bearer ${token}`, ...extra }
}

export function avatarUrl(path) {
  return path ? `${supabaseUrl}/storage/v1/object/public/avatars/${path}` : null
}

export async function loadProfile() {
  const id = userId()
  if (!id) return null
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*&user_id=eq.${id}`, { headers: headers() })
  if (!response.ok) throw new Error('Profila ni bilo mogoče naložiti.')
  return (await response.json())[0] ?? null
}

export async function uploadAvatar(file) {
  const id = userId()
  if (!id) throw new Error('Za nalaganje slike se prijavi.')
  if (!file.type.startsWith('image/')) throw new Error('Izberi slikovno datoteko.')
  if (file.size > 2 * 1024 * 1024) throw new Error('Slika naj bo manjša od 2 MB.')
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${id}/avatar.${extension}`
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
    method: 'PUT', headers: headers({ 'Content-Type': file.type, 'x-upsert': 'true' }), body: file,
  })
  if (!upload.ok) throw new Error('Profilne slike ni bilo mogoče naložiti.')
  const update = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${id}`, {
    method: 'PATCH', headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify({ avatar_path: path }),
  })
  if (!update.ok) throw new Error('Profilne slike ni bilo mogoče shraniti.')
  return (await update.json())[0]
}
