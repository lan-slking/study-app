import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { apiFetch } from './apiFetch.js'
import { subjectMeta } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'
import { daysUntilTest, formatDaysUntilTest } from './reviewPlan.js'
import { exportNoteAsPdf } from './exportNotePdf.jsx'
import { avatarUrl } from './profile.js'
import { supabase } from './supabase.js'

const MODE_LABELS = { full: 'Celotni zapiski', summary: 'Povzetek' }

// How recently we must have typed a local edit before we start trusting a
// Realtime echo of our own save over what's still in the text box — avoids
// a save round-trip landing mid-keystroke and reverting newer local input.
const OWN_EDIT_GRACE_MS = 2000

function ToolbarIcon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4" /><path d="m8.6 13.5 6.8 4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    done: <path d="m5 12 4 4L19 6" />,
    close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  }

  return <svg {...common}>{paths[name]}</svg>
}

function CollaboratorAvatar({ username, avatarPath }) {
  const url = avatarUrl(avatarPath)
  return (
    <span className="collaborator-avatar">
      {url ? <img src={url} alt="" /> : <span>{username?.[0]?.toUpperCase() ?? '?'}</span>}
    </span>
  )
}

// Zapiski is the main "look at your notes" screen: rendered Markdown as the
// primary content, with editing tucked behind a pencil icon and Kviz/Kartice
// as the two things you'd actually want to do next, pinned to the bottom.
function Zapiski({ note, currentUserId, onUpdateNote, onRemoteNoteUpdate, onBack, onOpenQuiz, onOpenFlashcards, onOpenDopolnjevanje }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [exportError, setExportError] = useState(null)

  const [isAccessMenuOpen, setIsAccessMenuOpen] = useState(false)
  const [collaborators, setCollaborators] = useState([])
  const [accessError, setAccessError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [justUpdated, setJustUpdated] = useState(false)

  const accessMenuRef = useRef(null)
  const noteRef = useRef(note)
  const lastLocalEditRef = useRef(0)

  const subject = subjectMeta(note.subject)
  const hasContent = Boolean(note.content.trim())
  const testCountdown = formatDaysUntilTest(daysUntilTest(note.test_date))

  const isOwner = Boolean(currentUserId) && note.user_id === currentUserId
  const myCollaboration = collaborators.find((c) => c.user_id === currentUserId)
  const canEdit = isOwner || myCollaboration?.permission === 'edit'

  useEffect(() => {
    noteRef.current = note
  }, [note])

  // Load who currently has access whenever a different note opens — also
  // powers the "👥 N" badge and (for non-owners) whether I can edit at all.
  useEffect(() => {
    let cancelled = false
    setCollaborators([])
    apiFetch(`/api/notes/${note.id}/collaborators`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCollaborators(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [note.id])

  // Live sync: when a collaborator's save lands, refresh title/content
  // without waiting for a manual reload. Last-write-wins if both edit at the
  // exact same moment — no character-level merge, by design.
  useEffect(() => {
    const channel = supabase
      .channel(`note-${note.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notes', filter: `id=eq.${note.id}` },
        (payload) => {
          if (Date.now() - lastLocalEditRef.current < OWN_EDIT_GRACE_MS) return
          const { title, content } = payload.new
          if (title === noteRef.current.title && content === noteRef.current.content) return
          onRemoteNoteUpdate(note.id, { title, content })
          setJustUpdated(true)
          setTimeout(() => setJustUpdated(false), 1500)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [note.id, onRemoteNoteUpdate])

  // Close the access menu on any click outside it.
  useEffect(() => {
    if (!isAccessMenuOpen) return
    function handlePointerDown(e) {
      if (accessMenuRef.current && !accessMenuRef.current.contains(e.target)) {
        setIsAccessMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isAccessMenuOpen])

  // Type-ahead search for who to share with, debounced.
  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setIsSearching(true)
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/profiles/search?q=${encodeURIComponent(query)}`)
        const data = await response.json()
        setSearchResults(Array.isArray(data) ? data : [])
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  function handleLocalUpdate(fields) {
    lastLocalEditRef.current = Date.now()
    onUpdateNote(fields)
  }

  async function handleExportPdf() {
    setIsExportingPdf(true)
    setExportError(null)
    try {
      await exportNoteAsPdf(note, subject.color)
    } catch (err) {
      setExportError(err.message || 'Izvoz v PDF ni uspel. Poskusi znova.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  async function handleAddCollaborator(result) {
    setAccessError(null)
    setCollaborators((prev) => [...prev, { ...result, permission: 'view' }])
    setSearchQuery('')
    setSearchResults([])
    try {
      const response = await apiFetch(`/api/notes/${note.id}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: result.user_id, permission: 'view' }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Dostopa ni bilo mogoče dodati.')
      }
    } catch (err) {
      setCollaborators((prev) => prev.filter((c) => c.user_id !== result.user_id))
      setAccessError(err.message || 'Dostopa ni bilo mogoče dodati.')
    }
  }

  function handleChangePermission(userId, permission) {
    setCollaborators((prev) => prev.map((c) => (c.user_id === userId ? { ...c, permission } : c)))
    apiFetch(`/api/notes/${note.id}/collaborators`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permission }),
    }).catch((err) => console.error('Failed to update permission:', err))
  }

  function handleRemoveCollaborator(userId) {
    setCollaborators((prev) => prev.filter((c) => c.user_id !== userId))
    apiFetch(`/api/notes/${note.id}/collaborators`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).catch((err) => console.error('Failed to remove collaborator:', err))
  }

  const searchResultsToShow = searchResults.filter(
    (result) => !collaborators.some((c) => c.user_id === result.user_id),
  )

  return (
    <main className="zapiski">
      <div className="zapiski-main">
        <div className="zapiski-topbar">
          <button type="button" className="icon-button tap" onClick={onBack} aria-label="Nazaj" title="Nazaj">
            <ToolbarIcon name="back" />
          </button>

          <div className="zapiski-topbar-actions">
            {justUpdated && <span className="zapiski-live-pill anim-pop-in">✓ Posodobljeno</span>}

            <div className="export-menu-wrap">
              <button
                type="button"
                className="icon-button tap"
                onClick={handleExportPdf}
                disabled={!hasContent || isExportingPdf}
                aria-label="Izvozi v PDF"
                title="Izvozi zapiske v PDF"
              >
                <ToolbarIcon name="download" />
              </button>

              {(isExportingPdf || exportError) && (
                <div className="export-menu">
                  {isExportingPdf && <p className="export-menu-item">Pripravljam PDF ...</p>}
                  {exportError && <p className="export-menu-error">{exportError}</p>}
                </div>
              )}
            </div>

            <div className="export-menu-wrap" ref={accessMenuRef}>
              <button
                type="button"
                className="icon-button tap"
                onClick={() => {
                  setIsAccessMenuOpen((v) => !v)
                  setAccessError(null)
                }}
                aria-label="Deli"
                title="Deli zapiske"
              >
                <ToolbarIcon name="share" />
              </button>

              {isAccessMenuOpen && (
                <>
                <div className="sheet-backdrop" onClick={() => setIsAccessMenuOpen(false)} />
                <div className="export-menu access-menu sheet-on-mobile">
                  {isOwner && (
                    <>
                      <input
                        type="text"
                        className="access-search-input"
                        placeholder="Poišči uporabnika po uporabniškem imenu"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                      {isSearching && <p className="export-menu-item">Iščem ...</p>}
                      {searchResultsToShow.map((result) => (
                        <button
                          key={result.user_id}
                          type="button"
                          className="share-link-row tap"
                          onClick={() => handleAddCollaborator(result)}
                        >
                          <CollaboratorAvatar username={result.username} avatarPath={result.avatar_path} />
                          <span className="share-link-info">
                            <span className="share-link-title">@{result.username}</span>
                          </span>
                          <span className="share-link-copy-btn">+</span>
                        </button>
                      ))}
                      {accessError && <p className="export-menu-error">{accessError}</p>}
                      {collaborators.length > 0 && <div className="access-menu-divider" />}
                    </>
                  )}

                  {collaborators.length === 0 ? (
                    <p className="export-menu-item access-menu-empty">
                      {isOwner ? 'Zapiskov še nisi delil.' : 'Zapisek je viden samo tebi in lastniku.'}
                    </p>
                  ) : (
                    collaborators.map((c) => (
                      <div key={c.user_id} className="share-link-row access-collaborator-row">
                        <CollaboratorAvatar username={c.username} avatarPath={c.avatar_path} />
                        <span className="share-link-info">
                          <span className="share-link-title">@{c.username}</span>
                        </span>
                        {isOwner ? (
                          <>
                            <select
                              className="access-permission-select"
                              value={c.permission}
                              onChange={(e) => handleChangePermission(c.user_id, e.target.value)}
                            >
                              <option value="view">Ogled</option>
                              <option value="edit">Urejanje</option>
                            </select>
                            <button
                              type="button"
                              className="icon-button tap access-remove-btn"
                              onClick={() => handleRemoveCollaborator(c.user_id)}
                              aria-label={`Odstrani dostop za @${c.username}`}
                            >
                              <ToolbarIcon name="close" size={14} />
                            </button>
                          </>
                        ) : (
                          <span className="access-permission-label">
                            {c.permission === 'edit' ? 'Urejanje' : 'Ogled'}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
                </>
              )}
            </div>

            {canEdit && (
              <button
                type="button"
                className="icon-button tap"
                onClick={() => setIsEditing((v) => !v)}
                aria-label={isEditing ? 'Končaj urejanje' : 'Uredi'}
                title={isEditing ? 'Končaj urejanje' : 'Uredi zapiske'}
              >
                <ToolbarIcon name={isEditing ? 'done' : 'edit'} />
              </button>
            )}
          </div>
        </div>

        <div className="zapiski-header anim-slide-up">
          <div className="zapiski-header-badges">
            {subject.label && (
              <span
                className="zapiski-subject-chip"
                style={{ background: `color-mix(in oklab, ${subject.color} 20%, transparent)`, color: subject.color }}
              >
                {subject.emoji} {subject.label}
              </span>
            )}

            {collaborators.length > 0 && (
              <button type="button" className="zapiski-collaborators-badge tap" onClick={() => setIsAccessMenuOpen(true)}>
                👥 {collaborators.length}
              </button>
            )}
          </div>

          {isEditing ? (
            <input
              type="text"
              className="zapiski-title-input"
              value={note.title}
              placeholder="Naslov snovi"
              onChange={(e) => handleLocalUpdate({ title: e.target.value })}
            />
          ) : (
            <h1 className="zapiski-title">{note.title || 'Neimenovana snov'}</h1>
          )}

          <div className="zapiski-meta">
            {note.mode && MODE_LABELS[note.mode] && <span>{MODE_LABELS[note.mode]}</span>}
            {note.mode && MODE_LABELS[note.mode] && <span>•</span>}
            <span>{formatRelativeDate(note.updated_at)}</span>
            {testCountdown && !isEditing && (
              <>
                <span>•</span>
                <span>🗓️ Test: {testCountdown}</span>
              </>
            )}
          </div>

          {isEditing && (
            <div className="zapiski-test-date">
              <label className="wizard-label" htmlFor="zapiski-test-date">
                Datum testa
              </label>
              <input
                id="zapiski-test-date"
                type="date"
                className="text-input"
                value={note.test_date ?? ''}
                onChange={(e) => handleLocalUpdate({ test_date: e.target.value || null })}
              />
            </div>
          )}
        </div>

        {isEditing ? (
          <textarea
            className="zapiski-textarea anim-slide-up"
            value={note.content}
            placeholder="Začni pisati ..."
            onChange={(e) => handleLocalUpdate({ content: e.target.value })}
          />
        ) : (
          <article className="zapiski-content anim-slide-up" style={{ '--subject-color': subject.color }}>
            {hasContent ? (
              <ReactMarkdown>{note.content}</ReactMarkdown>
            ) : (
              <p className="zapiski-content-empty">Ta snov je še prazna — dotakni se ✏️, da nekaj napišeš.</p>
            )}
          </article>
        )}
      </div>

      <div className="zapiski-actionbar">
        <div className="zapiski-actionbar-inner">
          <button
            type="button"
            className="action-button action-button-primary tap"
            onClick={onOpenQuiz}
            disabled={!hasContent}
          >
            <span className="action-button-emoji">🧠</span>
            <span>Kviz</span>
          </button>
          <button
            type="button"
            className="action-button action-button-primary tap"
            onClick={onOpenFlashcards}
            disabled={!hasContent}
          >
            <span className="action-button-emoji">🃏</span>
            <span>Kartice</span>
          </button>
          <button
            type="button"
            className="action-button action-button-primary tap"
            onClick={onOpenDopolnjevanje}
            disabled={!hasContent}
          >
            <span className="action-button-emoji">✍️</span>
            <span>Dopolni</span>
          </button>
        </div>
      </div>
    </main>
  )
}

export default Zapiski
