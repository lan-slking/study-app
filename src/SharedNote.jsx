import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import Quiz from './Quiz.jsx'
import { subjectMeta } from './subjects.js'

// SharedNote is the read-only public view opened from a "Deli" link (see
// Zapiski.jsx and main.jsx, which routes /shared/:token here instead of the
// normal authenticated app). No editing, no other notes, no owner stats —
// just the rendered content and, if they want it, the quiz.
function SharedNote({ token }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [showQuiz, setShowQuiz] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await fetch(`/api/shared/${token}`)
        let data
        try {
          data = await response.json()
        } catch {
          throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
        }
        if (!response.ok) {
          throw new Error(data.error || 'Ta povezava ni (več) veljavna.')
        }
        if (cancelled) return
        setNote(data)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(err.message || 'Ta povezava ni (več) veljavna.')
        setStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (status === 'loading') {
    return (
      <div className="app">
        <main className="zapiski status-panel">
          <div className="processing-spinner" />
          <p className="status-message">Nalagam deljeno snov ...</p>
        </main>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app">
        <main className="zapiski status-panel">
          <p className="status-message status-message-error">{error}</p>
        </main>
      </div>
    )
  }

  if (showQuiz) {
    return (
      <div className="app">
        <Quiz
          quizEndpoint={`/api/shared/${token}/quiz`}
          subjectColor={subjectMeta(note.subject).color}
          onClose={() => setShowQuiz(false)}
        />
      </div>
    )
  }

  const subject = subjectMeta(note.subject)
  const hasContent = Boolean(note.content.trim())

  return (
    <div className="app">
      <main className="zapiski">
        <div className="zapiski-main">
          <div className="zapiski-topbar">
            <span className="shared-note-badge">👀 Deljena snov</span>
            <div className="icon-button-spacer" />
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
            <h1 className="zapiski-title">{note.title || 'Neimenovana snov'}</h1>
          </div>

          <article className="zapiski-content anim-slide-up" style={{ '--subject-color': subject.color }}>
            {hasContent ? (
              <ReactMarkdown>{note.content}</ReactMarkdown>
            ) : (
              <p className="zapiski-content-empty">Ta snov je še prazna.</p>
            )}
          </article>

          <p className="shared-note-footer">Ustvarjeno s Piflar</p>
        </div>

        <div className="zapiski-actionbar">
          <div className="zapiski-actionbar-inner">
            <button
              type="button"
              className="action-button action-button-primary tap"
              onClick={() => setShowQuiz(true)}
              disabled={!hasContent}
            >
              🧠 Kviz
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default SharedNote
