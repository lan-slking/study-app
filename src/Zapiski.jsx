import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { apiFetch } from './apiFetch.js'
import { subjectMeta } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'
import { daysUntilTest, formatDaysUntilTest } from './reviewPlan.js'
import { exportNoteAsPdf } from './exportNotePdf.jsx'

const MODE_LABELS = { full: 'Celotni zapiski', summary: 'Povzetek' }

function ToolbarIcon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  const paths = {
    back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4" /><path d="m8.6 13.5 6.8 4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    done: <path d="m5 12 4 4L19 6" />,
    link: <><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><path d="M8 12h8" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  }

  return <svg {...common}>{paths[name]}</svg>
}

// Zapiski is the main "look at your notes" screen: rendered Markdown as the
// primary content, with editing tucked behind a pencil icon and Kviz/Kartice
// as the two things you'd actually want to do next, pinned to the bottom.
function Zapiski({ note, onUpdateNote, onBack, onOpenQuiz, onOpenFlashcards, onOpenDopolnjevanje }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareLink, setShareLink] = useState(null)
  const [shareError, setShareError] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const shareMenuRef = useRef(null)
  const subject = subjectMeta(note.subject)
  const hasContent = Boolean(note.content.trim())
  const testCountdown = formatDaysUntilTest(daysUntilTest(note.test_date))

  // Close the share menu on any click outside it — not just re-clicking the
  // share button — so it behaves like a normal dropdown.
  useEffect(() => {
    if (!isShareMenuOpen) return
    function handlePointerDown(e) {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target)) {
        setIsShareMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isShareMenuOpen])

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

  async function handleToggleShare() {
    setIsShareMenuOpen((v) => !v)
    setShareError(null)
    setCopyFeedback(false)
    if (shareLink) return // already generated this session — same link every time

    setIsSharing(true)
    try {
      const response = await apiFetch(`/api/notes/${note.id}/share`, { method: 'POST' })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
      }
      if (!response.ok) {
        throw new Error(data.error || 'Povezave za deljenje ni bilo mogoče ustvariti.')
      }
      setShareLink(`${window.location.origin}/?import=${data.shareToken}`)
    } catch (err) {
      setShareError(err.message || 'Povezave za deljenje ni bilo mogoče ustvariti.')
    } finally {
      setIsSharing(false)
    }
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    } catch {
      setCopyFeedback(false)
    }
  }

  return (
    <main className="zapiski">
      <div className="zapiski-main">
        <div className="zapiski-topbar">
          <button type="button" className="icon-button tap" onClick={onBack} aria-label="Nazaj" title="Nazaj">
            <ToolbarIcon name="back" />
          </button>

          <div className="zapiski-topbar-actions">
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

            <div className="export-menu-wrap" ref={shareMenuRef}>
              <button
                type="button"
                className="icon-button tap"
                onClick={handleToggleShare}
                disabled={!hasContent}
                aria-label="Deli"
                title="Deli povezavo"
              >
                <ToolbarIcon name="share" />
              </button>

              {isShareMenuOpen && (
                <div className="export-menu">
                  {isSharing && <p className="export-menu-item">Ustvarjam povezavo ...</p>}
                  {shareError && <p className="export-menu-error">{shareError}</p>}
                  {shareLink && (
                    <button type="button" className="share-link-row tap" onClick={handleCopyShareLink}>
                      <span className="share-link-icon">
                        <ToolbarIcon name="link" size={16} />
                      </span>
                      <span className="share-link-info">
                        <span className="share-link-title">Povezava za deljenje</span>
                        <span className="share-link-url">{shareLink}</span>
                      </span>
                      <span className={`share-link-copy-btn${copyFeedback ? ' share-link-copy-btn-done' : ''}`}>
                        <ToolbarIcon name={copyFeedback ? 'check' : 'copy'} size={16} />
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="icon-button tap"
              onClick={() => setIsEditing((v) => !v)}
              aria-label={isEditing ? 'Končaj urejanje' : 'Uredi'}
              title={isEditing ? 'Končaj urejanje' : 'Uredi zapiske'}
            >
              <ToolbarIcon name={isEditing ? 'done' : 'edit'} />
            </button>
          </div>
        </div>

        <div className="zapiski-header anim-slide-up">
          {subject.label && (
            <span
              className="zapiski-subject-chip"
              style={{ background: `color-mix(in oklab, ${subject.color} 20%, transparent)`, color: subject.color }}
            >
              {subject.emoji} {subject.label}
            </span>
          )}

          {isEditing ? (
            <input
              type="text"
              className="zapiski-title-input"
              value={note.title}
              placeholder="Naslov snovi"
              onChange={(e) => onUpdateNote({ title: e.target.value })}
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
                onChange={(e) => onUpdateNote({ test_date: e.target.value || null })}
              />
            </div>
          )}
        </div>

        {isEditing ? (
          <textarea
            className="zapiski-textarea anim-slide-up"
            value={note.content}
            placeholder="Začni pisati ..."
            onChange={(e) => onUpdateNote({ content: e.target.value })}
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
            🧠 Kviz
          </button>
          <button
            type="button"
            className="action-button action-button-primary tap"
            onClick={onOpenFlashcards}
            disabled={!hasContent}
          >
            🃏 Kartice
          </button>
          <button
            type="button"
            className="action-button action-button-primary tap"
            onClick={onOpenDopolnjevanje}
            disabled={!hasContent}
          >
            ✍️ Dopolni
          </button>
        </div>
      </div>
    </main>
  )
}

export default Zapiski
