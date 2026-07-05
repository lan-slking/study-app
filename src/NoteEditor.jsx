// NoteEditor shows the title and content of the currently selected note,
// and lets the user edit them. If no note is selected, it shows a placeholder.
function NoteEditor({ note, onUpdateNote }) {
  if (!note) {
    return (
      <main className="editor empty-state">
        <p>Select a note or create a new one to get started.</p>
      </main>
    )
  }

  return (
    <main className="editor">
      <input
        className="title-input"
        type="text"
        value={note.title}
        placeholder="Note title"
        onChange={(e) => onUpdateNote({ title: e.target.value })}
      />

      <textarea
        className="content-input"
        value={note.content}
        placeholder="Start writing..."
        onChange={(e) => onUpdateNote({ content: e.target.value })}
      />
    </main>
  )
}

export default NoteEditor
