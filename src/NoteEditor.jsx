import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

// NoteEditor shows the title and content of the currently selected note,
// and lets the user edit them. If no note is selected, it shows a placeholder.
function NoteEditor({ note, onUpdateNote }) {
  // Tracks whether we're currently waiting on the server to process a photo.
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  // Which prompt the backend should use — see PROMPTS in server/index.js.
  const [uploadMode, setUploadMode] = useState('full')

  // 'view' shows rendered Markdown; 'edit' shows the raw textarea.
  const [displayMode, setDisplayMode] = useState('edit')

  // Clicking the visible "Upload photo" button triggers this hidden file input.
  const fileInputRef = useRef(null)

  // Whenever a different note is selected, default to View if it already has
  // content (so you land on the pretty version), or Edit if it's empty.
  useEffect(() => {
    if (note) {
      setDisplayMode(note.content.trim() ? 'view' : 'edit')
    }
  }, [note?.id])

  if (!note) {
    return (
      <main className="editor empty-state">
        <p>Select a note or create a new one to get started.</p>
      </main>
    )
  }

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e) {
    const file = e.target.files[0]
    // Let the user pick the same file again later.
    e.target.value = ''
    if (!file) return

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('mode', uploadMode)

      // '/api/process-image' is proxied to the Express server by Vite (see vite.config.js).
      const response = await fetch('/api/process-image', {
        method: 'POST',
        body: formData,
      })

      // The server always responds with JSON, but guard against the rare case
      // where it doesn't (e.g. the backend isn't running, or a proxy/network
      // error returns an empty body) — parsing that with response.json() would
      // throw a cryptic "Unexpected end of JSON input" straight at the user.
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(
          "Couldn't reach the server. Make sure the backend is running (see server/README or the project README).",
        )
      }

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong processing your photo.')
      }

      // Insert the transcribed notes into the current note's content.
      const separator = note.content.trim() ? '\n\n' : ''
      onUpdateNote({ content: note.content + separator + data.notes })
      // Switch to the rendered view so the new Markdown shows up styled right away.
      setDisplayMode('view')
    } catch (err) {
      setUploadError(err.message || 'Something went wrong processing your photo.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <main className="editor">
      <div className="editor-toolbar">
        <input
          className="title-input"
          type="text"
          value={note.title}
          placeholder="Note title"
          onChange={(e) => onUpdateNote({ title: e.target.value })}
        />

        <select
          className="upload-mode-select"
          value={uploadMode}
          onChange={(e) => setUploadMode(e.target.value)}
          disabled={isUploading}
          aria-label="Upload mode"
        >
          <option value="full">Full notes</option>
          <option value="summary">Summary</option>
        </select>

        <button
          type="button"
          className="upload-button"
          onClick={handleUploadClick}
          disabled={isUploading}
        >
          {isUploading ? 'Processing...' : 'Upload photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelected}
          style={{ display: 'none' }}
        />
      </div>

      {uploadError && <p className="upload-error">{uploadError}</p>}

      <div className="display-mode-toggle" role="group" aria-label="Display mode">
        <button
          type="button"
          className={displayMode === 'edit' ? 'active' : ''}
          onClick={() => setDisplayMode('edit')}
          aria-pressed={displayMode === 'edit'}
        >
          Edit
        </button>
        <button
          type="button"
          className={displayMode === 'view' ? 'active' : ''}
          onClick={() => setDisplayMode('view')}
          aria-pressed={displayMode === 'view'}
        >
          View
        </button>
      </div>

      {displayMode === 'edit' ? (
        <textarea
          className="content-input"
          value={note.content}
          placeholder="Start writing..."
          onChange={(e) => onUpdateNote({ content: e.target.value })}
        />
      ) : (
        <div className="markdown-view">
          {note.content.trim() ? (
            <ReactMarkdown>{note.content}</ReactMarkdown>
          ) : (
            <p className="markdown-view-empty">Nothing here yet — switch to Edit to start writing.</p>
          )}
        </div>
      )}
    </main>
  )
}

export default NoteEditor
