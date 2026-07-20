import { useEffect, useRef, useState } from 'react'
import { subjectMeta, subjectsInUse } from './subjects.js'
import { formatRelativeDate } from './relativeDate.js'
import { daysUntilTest, formatDaysUntilTest } from './reviewPlan.js'
import { computeMastery } from './mastery.js'
import ProgressRing from './ProgressRing.jsx'

// Home is the app's landing screen: brand header, greeting, the single
// "start something new" action, and (once they exist) cards for the user's
// study topics. It receives everything as props from App.jsx. Notes someone
// else shared with the current user are mixed in here too (see the notes
// RLS policy in supabase/migrations/20260720_collaborative_sharing.sql) —
// they just carry a different note.user_id, which the "👥 Deljeno" badge
// below keys off.
function Home({
  notes,
  streak,
  currentUserId,
  profile,
  subjectFilter,
  onSelectNote,
  onAddNote,
  onDeleteNote,
  onOpenProfile,
  onLogout,
  onFilterSubject,
}) {
  const hasNotes = notes.length > 0
  const visibleNotes = subjectFilter ? notes.filter((note) => note.subject === subjectFilter) : notes
  const subjects = subjectsInUse(notes)

  // Mobile-only account menu (Profil / Odjava). On desktop the sidebar owns
  // this, so this markup lives inside .home-topbar which is display:none at
  // >=1024px. Outside-click close mirrors Sidebar.jsx / Zapiski.jsx.
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef(null)

  useEffect(() => {
    if (!isAccountMenuOpen) return
    function handlePointerDown(event) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setIsAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isAccountMenuOpen])

  return (
    <main className="home">
      <header className="home-topbar anim-slide-up">
        <div className="home-brand">
          <div className="home-logo">P</div>
          <span className="home-wordmark">Piflar</span>
        </div>
        <div className="home-topbar-right">
          {streak > 0 && (
            <div className="home-streak" title="Zaporedni dnevi učenja">
              <span>🔥</span>
              <span className="home-streak-count">{streak}</span>
            </div>
          )}
          <div className="export-menu-wrap home-account-wrap" ref={accountMenuRef}>
            <button
              type="button"
              className="home-account-btn tap"
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              aria-label="Račun"
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
            >
              <span className="profile-avatar">
                {profile?.avatar_path ? (
                  <img src={profile.avatar_url} alt="Profilna slika" />
                ) : (
                  <span>{profile?.username?.[0]?.toUpperCase() ?? 'P'}</span>
                )}
              </span>
            </button>
            {isAccountMenuOpen && (
              <>
                <div className="sheet-backdrop" onClick={() => setIsAccountMenuOpen(false)} />
                <div className="export-menu account-sheet" role="menu">
                  <button
                    type="button"
                    className="export-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setIsAccountMenuOpen(false)
                      onOpenProfile?.()
                    }}
                  >
                    👤 Profil
                  </button>
                  <div className="access-menu-divider" />
                  <button
                    type="button"
                    className="export-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setIsAccountMenuOpen(false)
                      onLogout?.()
                    }}
                  >
                    🚪 Odjava
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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

      {subjects.length > 0 && (
        <nav
          className="subject-filter-row anim-slide-up"
          style={{ animationDelay: '160ms' }}
          aria-label="Filter po predmetu"
        >
          <button
            type="button"
            className={`filter-chip tap ${!subjectFilter ? 'active' : ''}`}
            onClick={() => onFilterSubject?.(null)}
          >
            Vsi
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.key}
              type="button"
              className={`filter-chip tap ${subjectFilter === subject.key ? 'active' : ''}`}
              style={{ '--chip-color': subject.color }}
              onClick={() => onFilterSubject?.(subject.key)}
            >
              <span className="filter-chip-emoji">{subject.emoji}</span>
              {subject.label}
            </button>
          ))}
        </nav>
      )}

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
            const isShared = Boolean(currentUserId) && note.user_id !== currentUserId
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
                      {isShared && <span className="note-card-shared-badge">👥 Deljeno</span>}
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

                {!isShared && (
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
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

export default Home
