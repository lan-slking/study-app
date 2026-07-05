// Sidebar shows the list of all notes, plus a button to add a new one.
// It receives everything it needs as props from App.jsx — it has no state of its own.
function Sidebar({ notes, selectedId, onSelectNote, onAddNote, onDeleteNote }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Notes</h2>
        <button type="button" onClick={onAddNote}>
          + New Note
        </button>
      </div>

      <ul className="note-list">
        {notes.length === 0 && <li className="empty">No notes yet</li>}

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
            >
              {note.title || 'Untitled Note'}
            </button>

            {/* Clicking delete removes the note without selecting it first. */}
            <button
              type="button"
              className="delete-button"
              onClick={() => onDeleteNote(note.id)}
              aria-label={`Delete ${note.title || 'Untitled Note'}`}
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
