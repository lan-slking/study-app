import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Manjkajo SUPABASE_URL ali SUPABASE_PUBLISHABLE_KEY v server/.env.')
}

const authClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const publicClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function resultOrThrow({ data, error }) {
  if (error) throw error
  return data
}

// Verifies the JWT issued by Supabase Auth and returns a database client that
// carries that exact token. Every query is consequently checked by RLS.
export async function databaseForRequest(authorization) {
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) return null

  return {
    user: data.user,
    client: createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }),
  }
}

export async function getAllNotes(client) {
  return resultOrThrow(await client.from('notes').select('*').order('updated_at', { ascending: false }))
}

export async function getNoteById(client, id) {
  const { data, error } = await client.from('notes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function getSharedNoteByToken(token) {
  const rows = resultOrThrow(await publicClient.rpc('get_shared_note', { share_token_input: token }))
  return rows[0] ?? null
}

export async function createNote(client, { title, content, subject = '', mode = '', testDate = null }) {
  const rows = resultOrThrow(await client
    .from('notes')
    .insert({ title, content, subject, mode, test_date: testDate })
    .select())
  return rows[0]
}

export async function updateNote(client, id, { title, content, subject, testDate }) {
  const patch = { updated_at: new Date().toISOString() }
  if (title !== undefined) patch.title = title
  if (content !== undefined) patch.content = content
  if (subject !== undefined) patch.subject = subject
  if (testDate !== undefined) patch.test_date = testDate
  const rows = resultOrThrow(await client.from('notes').update(patch).eq('id', id).select())
  return rows[0] ?? null
}

export async function deleteNote(client, id) {
  resultOrThrow(await client.from('notes').delete().eq('id', id))
}

export async function updateGeneratedContent(client, id, updates) {
  const rows = resultOrThrow(await client.from('notes').update(updates).eq('id', id).select())
  return rows[0] ?? null
}

export async function invalidateGeneratedContent(client, id) {
  return updateGeneratedContent(client, id, { quiz_json: null, flashcards_json: null, fill_blank_json: null })
}

const ACTIVITY_SCORE_COLUMNS = {
  quiz: ['last_quiz_correct', 'last_quiz_total'],
  flashcards: ['last_flashcards_correct', 'last_flashcards_total'],
  fill_blank: ['last_fill_blank_correct', 'last_fill_blank_total'],
}

export async function logActivity(client, noteId, { type, correct, total }) {
  resultOrThrow(await client.from('activity').insert({ note_id: noteId, type, correct: correct ?? null, total: total ?? null }))
  const [correctColumn, totalColumn] = ACTIVITY_SCORE_COLUMNS[type] ?? []
  const patch = { last_reviewed_at: new Date().toISOString() }
  if (correctColumn) {
    patch[correctColumn] = correct ?? null
    patch[totalColumn] = total ?? null
  }
  resultOrThrow(await client.from('notes').update(patch).eq('id', noteId))
}

export async function getStreak(client) {
  const activities = resultOrThrow(await client.from('activity').select('created_at').order('created_at', { ascending: false }))
  const days = [...new Set(activities.map(({ created_at }) => created_at.slice(0, 10)))]
  if (days.length === 0) return 0

  const toDate = (isoDay) => new Date(`${isoDay}T00:00:00Z`)
  const oneDayMs = 24 * 60 * 60 * 1000
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (Math.round((todayUtc - toDate(days[0])) / oneDayMs) > 1) return 0

  let streak = 1
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((toDate(days[i - 1]) - toDate(days[i])) / oneDayMs)
    if (gap === 1) streak++
    else if (gap > 1) break
  }
  return streak
}
