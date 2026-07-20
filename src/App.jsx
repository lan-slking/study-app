import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Home from './Home.jsx'
import NovaSnov from './NovaSnov.jsx'
import Zapiski from './Zapiski.jsx'
import Quiz from './Quiz.jsx'
import Flashcards from './Flashcards.jsx'
import Dopolnjevanje from './Dopolnjevanje.jsx'
import Profile from './Profile.jsx'
import { subjectMeta } from './subjects.js'
import AuthScreen from './AuthScreen.jsx'
import { apiFetch } from './apiFetch.js'
import { restoreSessionFromUrl, signOut } from './auth.js'
import { avatarUrl, loadProfile, uploadAvatar, getCurrentUserId } from './profile.js'
import { supabase } from './supabase.js'
import './App.css'

// How long to wait after the last keystroke before saving to the backend.
// Without this, every single keystroke would fire its own PUT request.
const SAVE_DEBOUNCE_MS = 600

// Maps an activity type to the note fields tracking its most recent result —
// mirrors ACTIVITY_SCORE_COLUMNS in server/db.js, used here only to mirror
// that update locally (see handleActivityLogged).
const ACTIVITY_SCORE_FIELDS = {
  quiz: ['last_quiz_correct', 'last_quiz_total'],
  flashcards: ['last_flashcards_correct', 'last_flashcards_total'],
  fill_blank: ['last_fill_blank_correct', 'last_fill_blank_total'],
}

// Matches SQLite's own datetime('now') shape ("YYYY-MM-DD HH:MM:SS", UTC) —
// used only for the optimistic local update in handleActivityLogged below,
// so it parses the same way as the real value that comes back from the
// server (see reviewPlan.js's reviewedToday).
function sqliteTimestampNow() {
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function App() {
  // All notes live here, loaded from the backend on startup (see the effect below).
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [session, setSession] = useState(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [profile, setProfile] = useState(null)

  // 'home' | 'wizard' | 'note' | 'quiz' | 'flashcards' | 'dopolnjevanje' | 'profile'
  const [view, setView] = useState('home')

  // Keep study modes mounted after first opening them, per note. This lets a
  // student move between modes and resume exactly where they stopped.
  const [openedStudyModes, setOpenedStudyModes] = useState({})

  // Loading/error state for the initial fetch, so we can show something
  // sensible instead of a blank screen while notes are loading.
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [streak, setStreak] = useState(0)

  // Subject clicked in the desktop sidebar (see Sidebar.jsx) — filters
  // Home's card grid. null means "show everything".
  const [subjectFilter, setSubjectFilter] = useState(null)

  // Tracks in-flight debounce timers per note id, so typing in note A doesn't
  // cancel a pending save for note B. Shape: { [noteId]: { timer, note } }.
  const pendingSavesRef = useRef({})

  const selectedNote = notes.find((note) => note.id === selectedId) ?? null

  useEffect(() => {
    setSession(restoreSessionFromUrl())
    setIsAuthLoading(false)
  }, [])

  // Realtime (used for live collaborator sync in Zapiski.jsx) is a separate
  // client from this app's actual auth flow (src/auth.js talks to GoTrue
  // directly with plain fetch, never through supabase-js) — so its socket
  // has to be handed the access token explicitly. setSession alone doesn't
  // reach Realtime here; setAuth is what postgres_changes checks against
  // each row's RLS policy. Note: this app has no token-refresh flow at all,
  // so — same as every other API call — this silently goes stale after the
  // token expires (~1h). Not fixing that pre-existing gap here.
  useEffect(() => {
    if (!session?.access_token) return
    supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
    supabase.realtime.setAuth(session.access_token)
  }, [session])

  // Load all notes from the backend once, when the app first mounts.
  useEffect(() => {
    if (!session) {
      setIsLoading(false)
      return undefined
    }
    setIsLoading(true)
    let cancelled = false

    async function loadNotes() {
      try {
        const response = await apiFetch('/api/notes')
        if (response.status === 401) {
          signOut()
          if (!cancelled) setSession(null)
          return
        }
        if (!response.ok) {
          throw new Error('Strežnik ni mogel naložiti zapiskov.')
        }
        const data = await response.json()
        if (cancelled) return
        setNotes(data)

        // Best-effort — a failed streak fetch shouldn't block the app from
        // loading notes, it just shows 0 until the next successful load.
        apiFetch('/api/streak')
          .then((r) => r.json())
          .then((s) => {
            if (!cancelled) setStreak(s.streak ?? 0)
          })
          .catch(() => {})
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
  }, [session])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    loadProfile().then((data) => data && setProfile({ ...data, avatar_url: avatarUrl(data.avatar_path) })).catch(console.error)
  }, [session])

  async function handleUploadAvatar(file) {
    try {
      const updated = await uploadAvatar(file)
      setProfile({ ...updated, avatar_url: `${avatarUrl(updated.avatar_path)}?v=${Date.now()}` })
    } catch (error) {
      window.alert(error.message || 'Profilne slike ni bilo mogoče naložiti.')
    }
  }

  function handleUsernameUpdated(updated) {
    setProfile((previous) => ({ ...previous, ...updated }))
  }

  // Also used after account deletion — the server-side row is already gone
  // by then, so this just drops back to AuthScreen the same way logout does.
  function handleLogout() {
    signOut()
    setSession(null)
  }

  // Actually send a note's current title/content/test date to the backend.
  async function saveNoteToServer(id, note) {
    try {
      await apiFetch(`/api/notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: note.title, content: note.content, testDate: note.test_date ?? null }),
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

  function openStudyMode(mode) {
    if (selectedId === null) return
    setOpenedStudyModes((previous) => ({
      ...previous,
      [selectedId]: { ...previous[selectedId], [mode]: true },
    }))
    setView(mode)
  }

  function hasOpenedStudyMode(mode) {
    return Boolean(selectedId !== null && openedStudyModes[selectedId]?.[mode])
  }

  function handleBackToHome() {
    if (selectedId !== null) flushPendingSave(selectedId)
    setView('home')
  }

  // "Domov" in the persistent desktop sidebar — usable from any screen, so
  // it also flushes a pending save if you were mid-edit, same as the normal
  // back button. Also clears any active subject filter, since a deliberate
  // "go home" reads as "show me everything" again.
  function handleGoHome() {
    if (selectedId !== null) flushPendingSave(selectedId)
    setSubjectFilter(null)
    setView('home')
  }

  function handleFilterSubject(subjectKey) {
    setSubjectFilter(subjectKey)
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

    apiFetch(`/api/notes/${id}`, { method: 'DELETE' }).catch((err) => {
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

  // Applies a change that a collaborator already saved on the server (via
  // Realtime), so it never re-triggers our own save — only local state
  // updates here, unlike handleUpdateNote above.
  function handleRemoteNoteUpdate(id, updatedFields) {
    setNotes((prev) => prev.map((note) => (note.id === id ? { ...note, ...updatedFields } : note)))
  }

  function handleQuizFinished(correct, total) {
    handleActivityLogged(selectedId, 'quiz', correct, total)
  }

  function handleFlashcardsFinished(correct, total) {
    handleActivityLogged(selectedId, 'flashcards', correct, total)
  }

  function handleDopolnjevanjeFinished(correct, total) {
    handleActivityLogged(selectedId, 'fill_blank', correct, total)
  }

  // Logs a completed study session (quiz / flashcards / fill_blank). Updates
  // that mode's last result on the note — mastery.js blends all three into
  // Home's progress ring, so every study mode now feeds it, not just Kviz —
  // and feeds the Domov streak and the "reviewed today" check in the review
  // plan. A single call on the backend (POST .../activity) handles all of
  // this server-side; the map here only mirrors it locally so the UI
  // updates instantly instead of waiting for a refetch.
  function handleActivityLogged(noteId, type, correct, total) {
    if (noteId === null) return
    const scoreFields = ACTIVITY_SCORE_FIELDS[type]
    setNotes((prev) =>
      prev.map((note) => {
        if (note.id !== noteId) return note
        const scoreUpdate = scoreFields ? { [scoreFields[0]]: correct, [scoreFields[1]]: total } : {}
        return { ...note, ...scoreUpdate, last_reviewed_at: sqliteTimestampNow() }
      }),
    )
    apiFetch(`/api/notes/${noteId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, correct, total }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Number.isInteger(data.streak)) setStreak(data.streak)
      })
      .catch((err) => {
        console.error('Failed to log activity:', err)
      })
  }

  if (isAuthLoading) {
    return <div className="app-status">Nalagam račun ...</div>
  }

  if (!session) {
    return <AuthScreen onAuthenticated={setSession} />
  }

  if (isLoading) {
    return <div className="app-status">Nalagam zapiske ...</div>
  }

  if (loadError) {
    return <div className="app-status app-status-error">{loadError}</div>
  }

  return (
    <div className="app">
      <Sidebar
        notes={notes}
        streak={streak}
        profile={profile}
        currentView={view}
        subjectFilter={subjectFilter}
        onOpenProfile={() => setView('profile')}
        onLogout={handleLogout}
        onGoHome={handleGoHome}
        onFilterSubject={handleFilterSubject}
      />

      <div className="app-content">
        {view === 'profile' && (
          <Profile
            profile={profile}
            onBack={handleGoHome}
            onUploadAvatar={handleUploadAvatar}
            onUsernameUpdated={handleUsernameUpdated}
            onAccountDeleted={handleLogout}
          />
        )}

        {view === 'wizard' && (
          <NovaSnov notes={notes} onCreated={handleNoteCreated} onCancel={() => setView('home')} />
        )}

        {view === 'note' && selectedNote && (
          <Zapiski
            note={selectedNote}
            currentUserId={getCurrentUserId()}
            onUpdateNote={handleUpdateNote}
            onRemoteNoteUpdate={handleRemoteNoteUpdate}
            onBack={handleBackToHome}
            onOpenQuiz={() => openStudyMode('quiz')}
            onOpenFlashcards={() => openStudyMode('flashcards')}
            onOpenDopolnjevanje={() => openStudyMode('dopolnjevanje')}
          />
        )}

        {selectedNote && hasOpenedStudyMode('quiz') && (
          <div className="study-mode-shell" hidden={view !== 'quiz'}>
            <Quiz
              key={`${selectedNote.id}-quiz`}
              quizEndpoint={`/api/notes/${selectedNote.id}/quiz`}
              subjectColor={subjectMeta(selectedNote.subject).color}
              onClose={() => setView('note')}
              onFinished={handleQuizFinished}
            />
          </div>
        )}

        {selectedNote && hasOpenedStudyMode('flashcards') && (
          <div className="study-mode-shell" hidden={view !== 'flashcards'}>
            <Flashcards
              key={`${selectedNote.id}-flashcards`}
              note={selectedNote}
              onClose={() => setView('note')}
              onFinished={handleFlashcardsFinished}
            />
          </div>
        )}

        {selectedNote && hasOpenedStudyMode('dopolnjevanje') && (
          <div className="study-mode-shell" hidden={view !== 'dopolnjevanje'}>
            <Dopolnjevanje
              key={`${selectedNote.id}-dopolnjevanje`}
              note={selectedNote}
              subjectColor={subjectMeta(selectedNote.subject).color}
              onClose={() => setView('note')}
              onFinished={handleDopolnjevanjeFinished}
            />
          </div>
        )}

        {view === 'home' && (
          <Home
            notes={notes}
            streak={streak}
            currentUserId={getCurrentUserId()}
            profile={profile}
            subjectFilter={subjectFilter}
            onSelectNote={handleSelectNote}
            onAddNote={() => setView('wizard')}
            onDeleteNote={handleDeleteNote}
            onOpenProfile={() => setView('profile')}
            onLogout={handleLogout}
            onFilterSubject={handleFilterSubject}
          />
        )}
      </div>
    </div>
  )
}

export default App
