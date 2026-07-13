import { subjectColor } from './subjectColor.js'

// Home is the app's landing screen: a greeting, the single "start something
// new" action, and (once they exist) cards for the user's study topics.
// It receives everything as props from App.jsx — no state of its own.
function Home({ notes, onSelectNote, onAddNote, onDeleteNote }) {
  const hasNotes = notes.length > 0

  return (
    <main className="home">
      <header className="home-header">
        <h1 className="home-greeting">Pozdravljen/a! 👋</h1>
        <p className="home-subtitle">Slikaj zapiske, dobi kviz.</p>
        <button type="button" className="btn-primary btn-large" onClick={onAddNote}>
          + Nova snov
        </button>
        {!hasNotes && <p className="home-hint">Tu bodo tvoje snovi, ko ustvariš prvo.</p>}
      </header>

      {hasNotes && (
        <ul className="note-card-grid">
          {notes.map((note) => (
            <li key={note.id} className="note-card">
              <button
                type="button"
                className="note-card-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteNote(note.id)
                }}
                aria-label={`Izbriši ${note.title || 'Neimenovana snov'}`}
              >
                ✕
              </button>

              <button type="button" className="note-card-body" onClick={() => onSelectNote(note.id)}>
                <span className="note-card-title">{note.title || 'Neimenovana snov'}</span>
                {note.subject && (
                  <span className="subject-chip" style={{ backgroundColor: subjectColor(note.subject) }}>
                    {note.subject}
                  </span>
                )}
                <span className="note-card-score">
                  {Number.isInteger(note.last_quiz_score)
                    ? `Zadnji kviz: ${note.last_quiz_score} %`
                    : 'Kviza še nisi opravil/a'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default Home
