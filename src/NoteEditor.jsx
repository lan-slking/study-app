import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { compressImage } from './compressImage.js'

// Separates the Markdown produced from each photo when multiple photos are
// combined into one note (a horizontal rule reads well as a page break).
const PAGE_SEPARATOR = '\n\n---\n\n'

// Human-readable label for each photo's status in the upload batch list.
const STATUS_LABELS = {
  pending: 'Waiting…',
  compressing: 'Compressing…',
  uploading: 'Reading…',
  done: 'Done',
}

// NoteEditor shows the title and content of the currently selected note,
// and lets the user edit them. If no note is selected, it shows a placeholder.
function NoteEditor({ note, onUpdateNote, onBusyChange }) {
  // The current batch of photos being turned into notes (see handleFilesSelected).
  // Each item: { id, file, status: 'pending'|'compressing'|'uploading'|'done'|'error', error, notes }
  const [batch, setBatch] = useState([])

  // Which prompt the backend should use — see PROMPTS in server/index.js.
  const [uploadMode, setUploadMode] = useState('full')

  // 'view' shows rendered Markdown; 'edit' shows the raw textarea.
  const [displayMode, setDisplayMode] = useState('edit')

  // Clicking the visible "Upload photos" button triggers this hidden file input.
  const fileInputRef = useRef(null)

  // Whenever a different note is selected, default to View if it already has
  // content (so you land on the pretty version), or Edit if it's empty.
  useEffect(() => {
    if (note) {
      setDisplayMode(note.content.trim() ? 'view' : 'edit')
    }
  }, [note?.id])

  // Tell App.jsx whenever there's an active (or awaiting-retry) upload batch,
  // so it can lock note switching — see the comment on isUploadBusy in App.jsx.
  useEffect(() => {
    onBusyChange?.(batch.length > 0)
  }, [batch, onBusyChange])

  // Once every photo in the batch has succeeded, combine their results (in
  // the order they were selected) into the note and clear the batch. If any
  // photo is still pending/processing/failed, we wait — see the Retry button.
  useEffect(() => {
    if (batch.length === 0) return
    const allDone = batch.every((item) => item.status === 'done')
    if (!allDone) return

    const combinedNotes = batch.map((item) => item.notes).join(PAGE_SEPARATOR)
    const separator = note.content.trim() ? '\n\n' : ''
    onUpdateNote({ content: note.content + separator + combinedNotes })
    setDisplayMode('view')
    setBatch([])
    // Only re-run this when the batch itself changes — note.content is read,
    // not depended on, to avoid re-triggering as onUpdateNote changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch])

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

  function updateBatchItem(id, updates) {
    setBatch((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }

  // Compress, upload, and process a single photo. Safe to call again for the
  // same item (that's what the Retry button does).
  async function processItem(item) {
    updateBatchItem(item.id, { status: 'compressing', error: null })

    let imageBlob
    try {
      imageBlob = await compressImage(item.file)
    } catch {
      // If compression fails for any reason, fall back to uploading the
      // original file rather than blocking the whole note on it.
      imageBlob = item.file
    }

    updateBatchItem(item.id, { status: 'uploading' })

    try {
      const formData = new FormData()
      formData.append('image', imageBlob, item.file.name)
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
          "Couldn't reach the server. Make sure the backend is running (see the project README).",
        )
      }

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong processing this photo.')
      }

      updateBatchItem(item.id, { status: 'done', notes: data.notes })
    } catch (err) {
      updateBatchItem(item.id, {
        status: 'error',
        error: err.message || 'Something went wrong processing this photo.',
      })
    }
  }

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files)
    // Let the user pick the same file(s) again later.
    e.target.value = ''
    if (files.length === 0) return

    const items = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      status: 'pending',
      error: null,
      notes: null,
    }))

    setBatch(items)
    processBatchSequentially(items)
  }

  // Process photos one at a time, not all at once — sending several photos to
  // Gemini in parallel risks tripping the API's rate limit on a multi-page
  // upload, which would turn "upload 6 photos" into several avoidable failures.
  async function processBatchSequentially(items) {
    for (const item of items) {
      await processItem(item)
    }
  }

  function handleRetry(item) {
    processItem(item)
  }

  // Locked for the whole lifetime of a batch (not just while actively
  // uploading) — otherwise clicking "Upload photos" again while a failed
  // photo is awaiting Retry would silently replace the batch and drop it.
  const isBatchBusy = batch.length > 0

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
          disabled={isBatchBusy}
          aria-label="Upload mode"
        >
          <option value="full">Full notes</option>
          <option value="summary">Summary</option>
        </select>

        <button
          type="button"
          className="upload-button"
          onClick={handleUploadClick}
          disabled={isBatchBusy}
        >
          {isBatchBusy ? 'Processing...' : 'Upload photos'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          style={{ display: 'none' }}
        />
      </div>

      {batch.length > 0 && (
        <ul className="upload-batch-list">
          {batch.map((item, index) => (
            <li key={item.id} className={`upload-batch-item status-${item.status}`}>
              <span className="upload-batch-name">
                {index + 1}. {item.file.name}
              </span>
              <span className="upload-batch-status">
                {item.status === 'error' ? item.error : STATUS_LABELS[item.status]}
              </span>
              {item.status === 'error' && (
                <button type="button" className="upload-retry-button" onClick={() => handleRetry(item)}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

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
