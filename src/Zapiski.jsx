import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { apiFetch } from './apiFetch.js'
import { subjectMeta } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'
import { daysUntilTest, formatDaysUntilTest } from './reviewPlan.js'
import { downloadTextFile, slugifyFilename, buildFlashcardsCsv } from './downloadFile.js'

const MODE_LABELS = { full: 'Celotni zapiski', summary: 'Povzetek' }

// Zapiski is the main "look at your notes" screen: rendered Markdown as the
// primary content, with editing tucked behind a pencil icon and Kviz/Kartice
// as the two things you'd actually want to do next, pinned to the bottom.
function Zapiski({ note, onUpdateNote, onBack, onOpenQuiz, onOpenFlashcards, onOpenDopolnjevanje }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareLink, setShareLink] = useState(null)
  const [shareError, setShareError] = useState(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const subject = subjectMeta(note.subject)
  const hasContent = Boolean(note.content.trim())
  const testCountdown = formatDaysUntilTest(daysUntilTest(note.test_date))

  function handleExportMarkdown() {
    downloadTextFile(`${slugifyFilename(note.title)}.md`, note.content, 'text/markdown;charset=utf-8')
    setIsExportMenuOpen(false)
  }

  async function handleExportFlashcardsCsv() {
    setIsExportingCsv(true)
    setExportError(null)
    try {
      const response = await apiFetch(`/api/notes/${note.id}/flashcards`, { method: 'POST' })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
      }
      if (!response.ok) {
        throw new Error(data.error || 'Kartončkov ni bilo mogoče ustvariti za izvoz.')
      }
      downloadTextFile(`${slugifyFilename(note.title)}-kartoncki.csv`, buildFlashcardsCsv(data.cards), 'text/csv;charset=utf-8')
      setIsExportMenuOpen(false)
    } catch (err) {
      setExportError(err.message || 'Izvoz ni uspel. Poskusi znova.')
    } finally {
      setIsExportingCsv(false)
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
      setShareLink(`${window.location.origin}/shared/${data.shareToken}`)
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
    } catch {
      setCopyFeedback(false)
    }
  }

  return (
    <main className="zapiski">
      <div className="zapiski-main">
        <div className="zapiski-topbar">
          <button type="button" className="icon-button tap" onClick={onBack} aria-label="Nazaj">
            ←
          </button>

          <div className="zapiski-topbar-actions">
            <div className="export-menu-wrap">
              <button
                type="button"
                className="icon-button tap"
                onClick={() => {
                  setIsExportMenuOpen((v) => !v)
                  setExportError(null)
                }}
                disabled={!hasContent}
                aria-label="Izvozi"
              >
                ⬇️
              </button>

              {isExportMenuOpen && (
                <div className="export-menu">
                  <button type="button" className="export-menu-item tap" onClick={handleExportFlashcardsCsv} disabled={isExportingCsv}>
                    📇 {isExportingCsv ? 'Pripravljam ...' : 'Kartončki (CSV)'}
                  </button>
                  <button type="button" className="export-menu-item tap" onClick={handleExportMarkdown}>
                    📝 Zapiski (Markdown)
                  </button>
                  {exportError && <p className="export-menu-error">{exportError}</p>}
                </div>
              )}
            </div>

            <div className="export-menu-wrap">
              <button
                type="button"
                className="icon-button tap"
                onClick={handleToggleShare}
                disabled={!hasContent}
                aria-label="Deli"
              >
                🔗
              </button>

              {isShareMenuOpen && (
                <div className="export-menu">
                  {isSharing && <p className="export-menu-item">Ustvarjam povezavo ...</p>}
                  {shareError && <p className="export-menu-error">{shareError}</p>}
                  {shareLink && (
                    <>
                      <p className="share-link-text">{shareLink}</p>
                      <button type="button" className="export-menu-item tap" onClick={handleCopyShareLink}>
                        {copyFeedback ? '✓ Kopirano!' : '📋 Kopiraj povezavo'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="icon-button tap"
              onClick={() => setIsEditing((v) => !v)}
              aria-label={isEditing ? 'Končaj urejanje' : 'Uredi'}
            >
              {isEditing ? '✓' : '✏️'}
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
