// Sidebar shows the list of all notes, plus a button to add a new one.
// It receives everything it needs as props from App.jsx — it has no state of its own.
// `isOpen` only matters on narrow screens, where the sidebar becomes a
// slide-in drawer (see the mobile media query in App.css).
function Sidebar({ notes, selectedId, onSelectNote, onAddNote, onDeleteNote, locked, isOpen }) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h2>Zapiski</h2>
        <button type="button" onClick={onAddNote} disabled={locked}>
          + Nov zapisek
        </button>
      </div>

      <ul className="note-list">
        {notes.length === 0 && (
          <li className="empty">Ni še zapiskov. Klikni "+ Nov zapisek", da začneš.</li>
        )}

        {notes.map((note) => (
          <li
            key={note.id}
            className={note.id === selectedId ? 'note-item selected' : 'note-item'}
          >
            {/* Clicking the title selects this note in the editor. */}
            <button
              type="button"
              className="note-title-button"
              onClick={() => onSelectNote(note.id)}
              disabled={locked}
            >
              {note.title || 'Neimenovan zapisek'}
            </button>

            {/* Clicking delete removes the note without selecting it first. */}
            <button
              type="button"
              className="delete-button"
              onClick={() => onDeleteNote(note.id)}
              disabled={locked}
              aria-label={`Izbriši ${note.title || 'Neimenovan zapisek'}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export default Sidebar
