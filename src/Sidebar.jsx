import { useEffect, useRef, useState } from 'react'
import { subjectsInUse } from './subjects.js'

// Persistent left navigation — desktop only (hidden via CSS below 1024px;
// mobile keeps Domov itself as the hub, per the redesign brief). Always
// rendered alongside whatever screen is active, not just on Domov.
function Sidebar({ notes, streak, currentView, subjectFilter, profile, onOpenProfile, onLogout, onGoHome, onFilterSubject }) {
  const subjects = subjectsInUse(notes)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef(null)

  // Close the account menu on any click outside it — same pattern as
  // Zapiski.jsx's share/access menu.
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
    <aside className="app-sidebar">
      <div className="export-menu-wrap app-sidebar-account-wrap" ref={accountMenuRef}>
        <button type="button" className="app-sidebar-profile tap" onClick={() => setIsAccountMenuOpen((open) => !open)}>
          <span className="profile-avatar">
            {profile?.avatar_path ? <img src={profile.avatar_url} alt="Profilna slika" /> : <span>{profile?.username?.[0]?.toUpperCase() ?? 'P'}</span>}
          </span>
          <div><strong>{profile?.username ?? 'Uporabnik'}</strong><span>Moj račun</span></div>
        </button>

        {isAccountMenuOpen && (
          <div className="export-menu">
            <button
              type="button"
              className="export-menu-item"
              onClick={() => {
                setIsAccountMenuOpen(false)
                onOpenProfile()
              }}
            >
              👤 Profil
            </button>
            <div className="access-menu-divider" />
            <button
              type="button"
              className="export-menu-item"
              onClick={() => {
                setIsAccountMenuOpen(false)
                onLogout()
              }}
            >
              🚪 Odjava
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className={`app-sidebar-link tap ${currentView === 'home' ? 'active' : ''}`}
        onClick={onGoHome}
      >
        🏠 Domov
      </button>

      {streak > 0 && (
        <div className="app-sidebar-streak">
          🔥 <span>{streak}</span> {streak === 1 ? 'dan zapored' : 'dni zapored'}
        </div>
      )}

      {subjects.length > 0 && (
        <div className="app-sidebar-subjects">
          <p className="app-sidebar-subjects-title">Predmeti</p>
          <ul className="app-sidebar-subject-list">
            <li>
              <button
                type="button"
                className={`app-sidebar-subject-item tap ${!subjectFilter ? 'active' : ''}`}
                onClick={() => onFilterSubject(null)}
              >
                Vsi
              </button>
            </li>
            {subjects.map((subject) => (
              <li key={subject.key}>
                <button
                  type="button"
                  className={`app-sidebar-subject-item tap ${subjectFilter === subject.key ? 'active' : ''}`}
                  onClick={() => onFilterSubject(subject.key)}
                >
                  <span style={{ color: subject.color }}>{subject.emoji}</span> {subject.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
