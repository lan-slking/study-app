import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { subjectMeta } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'

const MODE_LABELS = { full: 'Celotni zapiski', summary: 'Povzetek' }

// Zapiski is the main "look at your notes" screen: rendered Markdown as the
// primary content, with editing tucked behind a pencil icon and Kviz/Kartice
// as the two things you'd actually want to do next, pinned to the bottom.
function Zapiski({ note, onUpdateNote, onBack, onOpenQuiz, onOpenFlashcards }) {
  const [isEditing, setIsEditing] = useState(false)
  const subject = subjectMeta(note.subject)
  const hasContent = Boolean(note.content.trim())

  return (
    <main className="zapiski">
      <div className="zapiski-main">
        <div className="zapiski-topbar">
          <button type="button" className="icon-button tap" onClick={onBack} aria-label="Nazaj">
            ←
          </button>
          <button
            type="button"
            className="icon-button tap"
            onClick={() => setIsEditing((v) => !v)}
            aria-label={isEditing ? 'Končaj urejanje' : 'Uredi'}
          >
            {isEditing ? '✓' : '✏️'}
          </button>
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
          </div>
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
            className="action-button action-button-secondary tap"
            onClick={onOpenFlashcards}
            disabled={!hasContent}
          >
            🃏 Kartice
          </button>
        </div>
      </div>
    </main>
  )
}

export default Zapiski
