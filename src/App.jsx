import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import NoteEditor from './NoteEditor.jsx'
import './App.css'

// How long to wait after the last keystroke before saving to the backend.
// Without this, every single keystroke would fire its own PUT request.
const SAVE_DEBOUNCE_MS = 600

function App() {
  // All notes live here, loaded from the backend on startup (see the effect below).
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  // Loading/error state for the initial fetch, so we can show something
  // sensible instead of a blank screen while notes are loading.
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // On narrow screens the sidebar becomes a slide-in drawer instead of
  // always being visible next to the editor — see the mobile media query
  // in App.css. Irrelevant (and harmless) on wider screens.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Tracks in-flight debounce timers per note id, so typing in note A doesn't
  // cancel a pending save for note B. Shape: { [noteId]: { timer, note } }.
  const pendingSavesRef = useRef({})

  // True while NoteEditor has a photo-upload batch in progress. We lock note
  // switching/creating/deleting during this — NoteEditor doesn't unmount
  // between note switches, so if you could switch notes mid-upload, the
  // finished photos would get inserted into whichever note is selected when
  // they complete, not the note you were actually uploading to.
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
        setSelectedId(data[0]?.id ?? null)
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
      // Saving failed silently for now — Stage 5 (robustness) will surface
      // this kind of error in the UI instead of just logging it.
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
  // instead of waiting — used when switching notes or deleting, so an edit
  // made a moment ago never gets silently dropped.
  function flushPendingSave(id) {
    const pending = pendingSavesRef.current[id]
    if (!pending) return
    clearTimeout(pending.timer)
    delete pendingSavesRef.current[id]
    saveNoteToServer(id, pending.note)
  }

  // Select a different note, making sure any unsaved edit on the current one
  // is sent to the server first. Also closes the mobile sidebar drawer, since
  // picking a note means you want to look at it now.
  function handleSelectNote(id) {
    if (isUploadBusy) return
    if (selectedId !== null) flushPendingSave(selectedId)
    setSelectedId(id)
    setIsSidebarOpen(false)
  }

  // Create a brand new, empty note on the backend and select it right away.
  async function handleAddNote() {
    if (isUploadBusy) return
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', content: '' }),
    })
    const newNote = await response.json()
    setNotes([newNote, ...notes])
    setSelectedId(newNote.id)
    setIsSidebarOpen(false)
  }

  // Remove a note by id, both locally and on the backend. If we deleted the
  // selected note, clear the selection.
  function handleDeleteNote(id) {
    if (isUploadBusy) return
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
      {/* Only visible on narrow screens (see App.css) — opens the sidebar drawer. */}
      <button
        type="button"
        className="mobile-sidebar-toggle"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Odpri seznam zapiskov"
      >
        ☰ Zapiski
      </button>

      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />
      )}

      <Sidebar
        notes={notes}
        selectedId={selectedId}
        onSelectNote={handleSelectNote}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        locked={isUploadBusy}
        isOpen={isSidebarOpen}
      />
      <NoteEditor note={selectedNote} onUpdateNote={handleUpdateNote} onBusyChange={setIsUploadBusy} />
    </div>
  )
}

export default App
