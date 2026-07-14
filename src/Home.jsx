import { subjectMeta } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'
import { daysUntilTest, formatDaysUntilTest, computeTodaysReview } from './reviewPlan.js'
import ProgressRing from './ProgressRing.jsx'

// Home is the app's landing screen: brand header, greeting, the single
// "start something new" action, and (once they exist) cards for the user's
// study topics. It receives everything as props from App.jsx.
function Home({ notes, streak, onSelectNote, onAddNote, onDeleteNote }) {
  const hasNotes = notes.length > 0
  const todaysReview = computeTodaysReview(notes)

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
          <p>Slikaj zapiske, dobi kviz.</p>
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
            <span className="home-cta-subtitle">Slikaj in začni v 30 sekundah</span>
          </span>
          <span className="home-cta-arrow">→</span>
        </button>
      </div>

      {todaysReview.length > 0 && (
        <section className="review-section anim-slide-up" style={{ animationDelay: '160ms' }}>
          <h2 className="review-section-title">📅 Danes ponovi</h2>
          <ul className="review-card-list">
            {todaysReview.map((note) => {
              const subject = subjectMeta(note.subject)
              return (
                <li key={note.id}>
                  <button type="button" className="review-card tap" onClick={() => onSelectNote(note.id)}>
                    <span className="review-card-emoji" style={{ color: subject.color }}>
                      {subject.emoji}
                    </span>
                    <span className="review-card-title">{note.title || 'Neimenovana snov'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="home-section-header anim-slide-up" style={{ animationDelay: '200ms' }}>
        <h2>Tvoje snovi</h2>
        {hasNotes && <span className="home-count">{notes.length} {notes.length === 1 ? 'snov' : 'snovi'}</span>}
      </div>

      {hasNotes ? (
        <ul className="note-card-list">
          {notes.map((note, index) => {
            const subject = subjectMeta(note.subject)
            const testCountdown = formatDaysUntilTest(daysUntilTest(note.test_date))
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
                  <ProgressRing correct={note.last_quiz_correct} total={note.last_quiz_total} color={subject.color} />
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
      ) : (
        <p className="home-empty-hint anim-slide-up" style={{ animationDelay: '240ms' }}>
          Tu bodo tvoje snovi, ko ustvariš prvo.
        </p>
      )}
    </main>
  )
}

export default Home
