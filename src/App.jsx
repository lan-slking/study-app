import { useEffect, useRef, useState } from 'react'
import Home from './Home.jsx'
import NovaSnov from './NovaSnov.jsx'
import Zapiski from './Zapiski.jsx'
import Quiz from './Quiz.jsx'
import Flashcards from './Flashcards.jsx'
import { subjectMeta } from './subjects.js'
import './App.css'

// How long to wait after the last keystroke before saving to the backend.
// Without this, every single keystroke would fire its own PUT request.
const SAVE_DEBOUNCE_MS = 600

function App() {
  // All notes live here, loaded from the backend on startup (see the effect below).
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  // 'home' | 'wizard' | 'note' | 'quiz' | 'flashcards'
  const [view, setView] = useState('home')

  // Loading/error state for the initial fetch, so we can show something
  // sensible instead of a blank screen while notes are loading.
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Tracks in-flight debounce timers per note id, so typing in note A doesn't
  // cancel a pending save for note B. Shape: { [noteId]: { timer, note } }.
  const pendingSavesRef = useRef({})

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
  // instead of waiting — used when leaving the note screen, so an edit made a
  // moment ago never gets silently dropped.
  function flushPendingSave(id) {
    const pending = pendingSavesRef.current[id]
    if (!pending) return
    clearTimeout(pending.timer)
    delete pendingSavesRef.current[id]
    saveNoteToServer(id, pending.note)
  }

  function handleSelectNote(id) {
    setSelectedId(id)
    setView('note')
  }

  function handleBackToHome() {
    if (selectedId !== null) flushPendingSave(selectedId)
    setView('home')
  }

  // A brand new note is created only once the wizard finishes processing all
  // photos — see NovaSnov.jsx. This just wires the result into app state.
  function handleNoteCreated(note) {
    setNotes((prev) => [note, ...prev])
    setSelectedId(note.id)
    setView('note')
  }

  function handleDeleteNote(id) {
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

  // Persist a finished quiz's score onto the note, so Home's progress ring
  // reflects it next time — reuses the existing notes PUT endpoint.
  function handleQuizFinished(correct, total) {
    if (selectedId === null) return
    setNotes((prev) =>
      prev.map((note) =>
        note.id === selectedId ? { ...note, last_quiz_correct: correct, last_quiz_total: total } : note,
      ),
    )
    fetch(`/api/notes/${selectedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastQuizCorrect: correct, lastQuizTotal: total }),
    }).catch((err) => {
      console.error('Failed to save quiz result:', err)
    })
  }

  if (isLoading) {
    return <div className="app-status">Nalagam zapiske ...</div>
  }

  if (loadError) {
    return <div className="app-status app-status-error">{loadError}</div>
  }

  return (
    <div className="app">
      {view === 'wizard' && <NovaSnov onCreated={handleNoteCreated} onCancel={() => setView('home')} />}

      {view === 'note' && selectedNote && (
        <Zapiski
          note={selectedNote}
          onUpdateNote={handleUpdateNote}
          onBack={handleBackToHome}
          onOpenQuiz={() => setView('quiz')}
          onOpenFlashcards={() => setView('flashcards')}
        />
      )}

      {view === 'quiz' && selectedNote && (
        <Quiz
          note={selectedNote}
          subjectColor={subjectMeta(selectedNote.subject).color}
          onClose={() => setView('note')}
          onFinished={handleQuizFinished}
        />
      )}

      {view === 'flashcards' && selectedNote && <Flashcards note={selectedNote} onClose={() => setView('note')} />}

      {view === 'home' && (
        <Home
          notes={notes}
          onSelectNote={handleSelectNote}
          onAddNote={() => setView('wizard')}
          onDeleteNote={handleDeleteNote}
        />
      )}
    </div>
  )
}

export default App
