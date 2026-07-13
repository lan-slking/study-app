import { useEffect, useRef, useState } from 'react'
import Home from './Home.jsx'
import NoteEditor from './NoteEditor.jsx'
import './App.css'

// How long to wait after the last keystroke before saving to the backend.
// Without this, every single keystroke would fire its own PUT request.
const SAVE_DEBOUNCE_MS = 600

function App() {
  // All notes live here, loaded from the backend on startup (see the effect below).
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  // 'home' shows the greeting + list of study topics; 'note' shows the
  // full-screen editor for whichever note is selected.
  const [view, setView] = useState('home')

  // Loading/error state for the initial fetch, so we can show something
  // sensible instead of a blank screen while notes are loading.
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Tracks in-flight debounce timers per note id, so typing in note A doesn't
  // cancel a pending save for note B. Shape: { [noteId]: { timer, note } }.
  const pendingSavesRef = useRef({})

  // True while NoteEditor has a photo-upload batch in progress. We lock
  // leaving the note screen during this — NoteEditor doesn't unmount while
  // a batch is running, so if you could navigate back to Home mid-upload,
  // the finished photos would get inserted into whatever note the user
  // switches to next instead of the one they were actually uploading to.
  const [isUploadBusy, setIsUploadBusy] = useState(false)

  // Find the full note object that matches the selected id.
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null

  // Load all notes from the backend once, when the app first mounts.
  useEffect(() => {
    let cancelled = false

    async function loadNotes() {
      try {
        const response = await fetch('/api/notes')
        if (!response.ok) {
          throw new Error('Strežnik ni mogel naložiti zapiskov.')
        }
        const data = await response.json()
        if (cancelled) return
        setNotes(data)
      } catch {
        if (!cancelled) {
          setLoadError(
            'Strežnika ni bilo mogoče doseči. Preveri, ali backend teče (glej README).',
          )
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadNotes()
    return () => {
      cancelled = true
    }
  }, [])

  // Actually send a note's current title/content to the backend.
  async function saveNoteToServer(id, note) {
    try {
      await fetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: note.title, content: note.content }),
      })
    } catch (err) {
      console.error('Failed to save note:', err)
    }
  }

  // Debounce saving so we don't fire a request on every keystroke.
  function scheduleSave(id, note) {
    const existing = pendingSavesRef.current[id]
    if (existing) clearTimeout(existing.timer)

    const timer = setTimeout(() => {
      saveNoteToServer(id, note)
      delete pendingSavesRef.current[id]
    }, SAVE_DEBOUNCE_MS)

    pendingSavesRef.current[id] = { timer, note }
  }

  // If a note has a save waiting in the debounce timer, send it immediately
  // instead of waiting — used when leaving the note screen or deleting, so
  // an edit made a moment ago never gets silently dropped.
  function flushPendingSave(id) {
    const pending = pendingSavesRef.current[id]
    if (!pending) return
    clearTimeout(pending.timer)
    delete pendingSavesRef.current[id]
    saveNoteToServer(id, pending.note)
  }

  // Open a note in the full-screen editor.
  function handleSelectNote(id) {
    setSelectedId(id)
    setView('note')
  }

  // Leave the note editor and return to Home. Blocked while a photo batch is
  // in progress — see the comment on isUploadBusy above.
  function handleBackToHome() {
    if (isUploadBusy) return
    if (selectedId !== null) flushPendingSave(selectedId)
    setView('home')
  }

  // Create a brand new, empty note on the backend and open it right away.
  async function handleAddNote() {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', content: '' }),
    })
    const newNote = await response.json()
    setNotes([newNote, ...notes])
    setSelectedId(newNote.id)
    setView('note')
  }

  // Remove a note by id, both locally and on the backend.
  function handleDeleteNote(id) {
    // Cancel any pending save — there's no point saving a note we're deleting.
    const pending = pendingSavesRef.current[id]
    if (pending) {
      clearTimeout(pending.timer)
      delete pendingSavesRef.current[id]
    }

    setNotes(notes.filter((note) => note.id !== id))
    if (id === selectedId) {
      setSelectedId(null)
    }

    fetch(`/api/notes/${id}`, { method: 'DELETE' }).catch((err) => {
      console.error('Failed to delete note:', err)
    })
  }

  // Update the title or content of the currently selected note. Updates
  // local state immediately so typing feels instant, and schedules a
  // debounced save to persist the change to the backend.
  function handleUpdateNote(updatedFields) {
    const current = notes.find((note) => note.id === selectedId)
    if (!current) return

    const updatedNote = { ...current, ...updatedFields }
    setNotes(notes.map((note) => (note.id === selectedId ? updatedNote : note)))
    scheduleSave(selectedId, updatedNote)
  }

  if (isLoading) {
    return <div className="app-status">Nalagam zapiske ...</div>
  }

  if (loadError) {
    return <div className="app-status app-status-error">{loadError}</div>
  }

  return (
    <div className="app">
      {view === 'note' && selectedNote ? (
        <NoteEditor
          note={selectedNote}
          onUpdateNote={handleUpdateNote}
          onBusyChange={setIsUploadBusy}
          onBack={handleBackToHome}
          isBackLocked={isUploadBusy}
        />
      ) : (
        <Home
          notes={notes}
          onSelectNote={handleSelectNote}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
        />
      )}
    </div>
  )
}

export default App
