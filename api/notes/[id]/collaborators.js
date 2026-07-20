import { authenticate } from '../../../server/requireAuth.js'
import {
  getNoteById,
  getNoteCollaborators,
  addCollaborator,
  updateCollaboratorPermission,
  removeCollaborator,
} from '../../../server/db.js'

const PERMISSIONS = new Set(['view', 'edit'])

// Manage who has access to a note (view/edit) — see src/Zapiski.jsx's
// share/manage-access panel. RLS is the real authorization boundary (only
// the note's owner passes note_collaborators' insert/update/delete policy),
// these checks just turn that into a friendly error instead of an empty
// Supabase error.
export default async function handler(req, res) {
  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const id = req.query.id

  if (req.method === 'GET') {
    const collaborators = await getNoteCollaborators(auth.db, id)
    return res.json(collaborators)
  }

  if (req.method === 'POST') {
    const note = await getNoteById(auth.db, id)
    if (!note) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })
    if (note.user_id !== auth.user.id) {
      return res.status(403).json({ error: 'Samo lastnik zapiska lahko doda dostop.' })
    }

    const { userId, permission = 'view' } = req.body ?? {}
    if (!userId) return res.status(400).json({ error: 'Manjka uporabnik, s katerim želiš deliti.' })
    if (!PERMISSIONS.has(permission)) return res.status(400).json({ error: 'Neveljavno dovoljenje.' })
    if (userId === note.user_id) return res.status(400).json({ error: 'Zapisek je že tvoj.' })

    try {
      const collaborator = await addCollaborator(auth.db, { noteId: id, userId, permission, invitedBy: auth.user.id })
      return res.status(201).json(collaborator)
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Ta oseba že ima dostop do zapiska.' })
      console.error('Add collaborator error:', err)
      return res.status(500).json({ error: 'Dostopa ni bilo mogoče dodati.' })
    }
  }

  if (req.method === 'PATCH') {
    const { userId, permission } = req.body ?? {}
    if (!userId || !PERMISSIONS.has(permission)) {
      return res.status(400).json({ error: 'Neveljavna zahteva.' })
    }
    const updated = await updateCollaboratorPermission(auth.db, { noteId: id, userId, permission })
    if (!updated) return res.status(404).json({ error: 'Dostopa ni bilo mogoče najti.' })
    return res.json(updated)
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body ?? {}
    if (!userId) return res.status(400).json({ error: 'Manjka uporabnik.' })
    await removeCollaborator(auth.db, { noteId: id, userId })
    return res.status(204).end()
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
