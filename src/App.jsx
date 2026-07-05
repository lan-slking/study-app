import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import NoteEditor from './NoteEditor.jsx'
import './App.css'

// A single note looks like: { id, title, content }
// We start with one example note so the app isn't empty on first load.
const initialNotes = [
  {
    id: 1,
    title: 'Welcome!',
    content: 'This is your first note. Click "New Note" to add another, or start editing this one.',
  },
]

function App() {
  // All notes live here, in the parent component's state.
  const [notes, setNotes] = useState(initialNotes)

  // The id of the note currently shown in the editor.
  const [selectedId, setSelectedId] = useState(initialNotes[0]?.id ?? null)

  // Find the full note object that matches the selected id.
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null

  // Create a brand new, empty note and select it right away.
  function handleAddNote() {
    const newNote = {
      id: Date.now(), // Good enough as a unique id for this simple app.
      title: 'Untitled Note',
      content: '',
    }
    setNotes([newNote, ...notes])
    setSelectedId(newNote.id)
  }

  // Remove a note by id. If we deleted the selected note, clear the selection.
  function handleDeleteNote(id) {
    setNotes(notes.filter((note) => note.id !== id))
    if (id === selectedId) {
      setSelectedId(null)
    }
  }

  // Update the title or content of the currently selected note.
  function handleUpdateNote(updatedFields) {
    setNotes(
      notes.map((note) =>
        note.id === selectedId ? { ...note, ...updatedFields } : note
      )
    )
  }

  return (
    <div className="app">
      <Sidebar
        notes={notes}
        selectedId={selectedId}
        onSelectNote={setSelectedId}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
      />
      <NoteEditor note={selectedNote} onUpdateNote={handleUpdateNote} />
    </div>
  )
}

export default App
