import { useState } from 'react'
import { subjectMeta } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'
import { daysUntilTest, formatDaysUntilTest } from './reviewPlan.js'
import { computeMastery } from './mastery.js'
import ProgressRing from './ProgressRing.jsx'

// Home is the app's landing screen: brand header, greeting, the single
// "start something new" action, and (once they exist) cards for the user's
// study topics. It receives everything as props from App.jsx.
function Home({ notes, streak, subjectFilter, onSelectNote, onAddNote, onDeleteNote, onImportSharedLink }) {
  const [sharedLink, setSharedLink] = useState('')
  const [importError, setImportError] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const hasNotes = notes.length > 0
  const visibleNotes = subjectFilter ? notes.filter((note) => note.subject === subjectFilter) : notes

  async function handleImport(event) {
    event.preventDefault()
    setIsImporting(true)
    setImportError(null)
    try {
      await onImportSharedLink(sharedLink)
      setSharedLink('')
    } catch (error) {
      setImportError(error.message || 'Zapiska ni bilo mogoče dodati.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <main className="home">
      <header className="home-topbar anim-slide-up">
        <div className="home-brand">
          <div className="home-logo">P</div>
          <span className="home-wordmark">Piflar</span>
        </div>
        {streak > 0 && (
          <div className="home-streak" title="Zaporedni dnevi učenja">
            <span>🔥</span>
            <span className="home-streak-count">{streak}</span>
          </div>
        )}
      </header>

      <div className="home-hero">
        <div className="home-greeting anim-slide-up" style={{ animationDelay: '60ms' }}>
          <h1>
            Živjo! <span className="anim-float-slow">👋</span>
          </h1>
          <p>Slikaj, ustvari zapiske in se nauči!</p>
        </div>

        <button
          type="button"
          className="home-cta tap anim-pop-in"
          style={{ animationDelay: '120ms' }}
          onClick={onAddNote}
        >
          <span className="home-cta-icon">➕</span>
          <span className="home-cta-text">
            <span className="home-cta-title">Nova snov</span>
            <span className="home-cta-subtitle">Slikaj in začni!</span>
          </span>
          <span className="home-cta-arrow">→</span>
        </button>
      </div>

      <form className="shared-import anim-slide-up" onSubmit={handleImport}>
        <label htmlFor="shared-link">Dodaj deljeno snov</label>
        <div>
          <input id="shared-link" type="url" value={sharedLink} onChange={(event) => setSharedLink(event.target.value)} placeholder="Prilepi povezavo do zapiska" required />
          <button type="submit" className="secondary-button tap" disabled={isImporting}>{isImporting ? 'Dodajam ...' : 'Dodaj'}</button>
        </div>
        {importError && <p>{importError}</p>}
      </form>

      <div className="home-section-header anim-slide-up" style={{ animationDelay: '200ms' }}>
        <h2>Tvoje snovi</h2>
        {hasNotes && (
          <span className="home-count">
            {visibleNotes.length} {visibleNotes.length === 1 ? 'snov' : 'snovi'}
          </span>
        )}
      </div>

      {!hasNotes ? (
        <p className="home-empty-hint anim-slide-up" style={{ animationDelay: '240ms' }}>
          Tu bodo tvoje snovi, ko ustvariš prvo.
        </p>
      ) : visibleNotes.length === 0 ? (
        <p className="home-empty-hint anim-slide-up">Ni snovi za ta predmet.</p>
      ) : (
        <ul className="note-card-list">
          {visibleNotes.map((note, index) => {
            const subject = subjectMeta(note.subject)
            const testCountdown = formatDaysUntilTest(daysUntilTest(note.test_date))
            const mastery = computeMastery(note)
            return (
              <li
                key={note.id}
                className="note-card-wrap anim-slide-up"
                style={{ animationDelay: `${240 + index * 60}ms` }}
              >
                <button type="button" className="note-card tap" onClick={() => onSelectNote(note.id)}>
                  <div
                    className="note-card-icon"
                    style={{ background: `color-mix(in oklab, ${subject.color} 20%, transparent)`, color: subject.color }}
                  >
                    {subject.emoji}
                  </div>
                  <div className="note-card-info">
                    <div className="note-card-title">{note.title || 'Neimenovana snov'}</div>
                    <div className="note-card-meta">
                      {subject.label && (
                        <span
                          className="note-card-subject"
                          style={{ background: `color-mix(in oklab, ${subject.color} 18%, transparent)`, color: subject.color }}
                        >
                          {subject.label}
                        </span>
                      )}
                      <span>{formatRelativeDate(note.updated_at)}</span>
                      {testCountdown && <span className="note-card-countdown">🗓️ {testCountdown}</span>}
                    </div>
                  </div>
                  <ProgressRing
                    ratio={mastery !== null ? mastery / 100 : null}
                    label={mastery !== null ? `${mastery}%` : undefined}
                    title={mastery !== null ? `Skupno znanje: ${mastery} %` : 'Še ni podatkov o znanju'}
                    color={subject.color}
                    size={44}
                    strokeWidth={4}
                  />
                </button>

                <button
                  type="button"
                  className="note-card-delete tap"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteNote(note.id)
                  }}
                  aria-label={`Izbriši ${note.title || 'Neimenovana snov'}`}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

export default Home
