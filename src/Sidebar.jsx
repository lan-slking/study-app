import { subjectsInUse } from './subjects.js'

// Persistent left navigation — desktop only (hidden via CSS below 1024px;
// mobile keeps Domov itself as the hub, per the redesign brief). Always
// rendered alongside whatever screen is active, not just on Domov.
function Sidebar({ notes, streak, currentView, subjectFilter, profile, onUploadAvatar, onGoHome, onAddNote, onFilterSubject }) {
  const subjects = subjectsInUse(notes)

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar-profile">
        <label className="profile-avatar" title="Spremeni profilno sliko">
          {profile?.avatar_path ? <img src={profile.avatar_url} alt="Profilna slika" /> : <span>{profile?.username?.[0]?.toUpperCase() ?? 'P'}</span>}
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUploadAvatar(event.target.files[0])} />
        </label>
        <div><strong>{profile?.username ?? 'Uporabnik'}</strong><span>Uredi profilno sliko</span></div>
      </div>

      <button
        type="button"
        className={`app-sidebar-link tap ${currentView === 'home' ? 'active' : ''}`}
        onClick={onGoHome}
      >
        🏠 Domov
      </button>

      <button type="button" className="app-sidebar-cta tap" onClick={onAddNote}>
        + Nova snov
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
