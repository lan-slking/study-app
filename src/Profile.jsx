import { useState } from 'react'
import { getSessionEmail, updatePassword } from './auth.js'
import { updateUsername, deleteAccount } from './profile.js'

// Real stored passwords are never retrievable — GoTrue (like every auth
// system) only ever holds a hash, so the "eye" toggle in view mode can't
// reveal actual characters. It shows an explanation instead. The eye toggle
// inside the edit form is a normal show/hide of what's currently being typed.
function Profile({ profile, onBack, onUploadAvatar, onUsernameUpdated, onAccountDeleted }) {
  const email = getSessionEmail() ?? ''

  const [isEditing, setIsEditing] = useState(false)
  const [username, setUsername] = useState(profile?.username ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false)
  const [isPasswordHintVisible, setIsPasswordHintVisible] = useState(false)

  const [status, setStatus] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const [deleteError, setDeleteError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function handleStartEditing() {
    setUsername(profile?.username ?? '')
    setNewPassword('')
    setConfirmPassword('')
    setStatus(null)
    setIsEditing(true)
  }

  function handleCancelEditing() {
    setIsEditing(false)
    setNewPassword('')
    setConfirmPassword('')
    setStatus(null)
  }

  async function handleSave(event) {
    event.preventDefault()
    setStatus(null)

    const trimmedUsername = username.trim().toLowerCase()
    if (newPassword && newPassword.length < 6) {
      setStatus({ type: 'error', text: 'Geslo naj ima vsaj 6 znakov.' })
      return
    }
    if (newPassword && newPassword !== confirmPassword) {
      setStatus({ type: 'error', text: 'Gesli se ne ujemata.' })
      return
    }

    setIsSaving(true)
    try {
      if (trimmedUsername !== profile?.username) {
        const updated = await updateUsername(trimmedUsername)
        onUsernameUpdated(updated)
      }
      if (newPassword) {
        await updatePassword(newPassword)
      }
      setNewPassword('')
      setConfirmPassword('')
      setIsEditing(false)
      setStatus({ type: 'success', text: 'Spremembe so shranjene.' })
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Sprememb ni bilo mogoče shraniti.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Ali res želiš trajno izbrisati svoj račun in vse zapiske? Tega dejanja ni mogoče razveljaviti.')) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      await deleteAccount()
      onAccountDeleted()
    } catch (error) {
      setDeleteError(error.message || 'Računa ni bilo mogoče izbrisati.')
      setIsDeleting(false)
    }
  }

  return (
    <main className="profile-page">
      <div className="profile-page-topbar">
        <button type="button" className="icon-button tap" onClick={onBack} aria-label="Nazaj" title="Nazaj">←</button>
        <h1>Profil</h1>
      </div>

      <section className="profile-section">
        <div className="profile-section-header">
          <h2>Podatki o računu</h2>
          {!isEditing && (
            <button
              type="button"
              className="icon-button tap"
              onClick={handleStartEditing}
              aria-label="Uredi profil"
              title="Uredi sliko, uporabniško ime in geslo"
            >
              ✎
            </button>
          )}
        </div>

        <div className="profile-avatar-row">
          <label className={`profile-avatar profile-avatar-lg ${isEditing ? 'profile-avatar-editable' : ''}`} title={isEditing ? 'Spremeni profilno sliko' : undefined}>
            {profile?.avatar_path ? (
              <img src={profile.avatar_url} alt="Profilna slika" />
            ) : (
              <span>{profile?.username?.[0]?.toUpperCase() ?? 'P'}</span>
            )}
            {isEditing && (
              <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUploadAvatar(event.target.files[0])} />
            )}
          </label>
        </div>

        {!isEditing ? (
          <div className="profile-view-rows">
            <div className="profile-view-row">
              <span className="profile-view-label">Uporabniško ime</span>
              <span className="profile-view-value">@{profile?.username ?? '—'}</span>
            </div>
            <div className="profile-view-row">
              <span className="profile-view-label">E-pošta</span>
              <span className="profile-view-value">{email || '—'}</span>
            </div>
            <div className="profile-view-row">
              <span className="profile-view-label">Geslo</span>
              <span className="profile-view-value profile-password-value">
                <span>{isPasswordHintVisible ? 'Iz varnostnih razlogov gesla ni mogoče prikazati.' : '••••••••'}</span>
                <button
                  type="button"
                  className="icon-button tap profile-eye-btn"
                  onClick={() => setIsPasswordHintVisible((visible) => !visible)}
                  aria-label="Pokaži geslo"
                  title="Pokaži geslo"
                >
                  👁
                </button>
              </span>
            </div>

            {status && <p className={`auth-message ${status.type}`}>{status.text}</p>}
          </div>
        ) : (
          <form className="profile-edit-form" onSubmit={handleSave}>
            <label>
              Uporabniško ime
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                pattern="[a-z0-9_]{3,20}"
                title="3–20 malih črk, številk ali podčrtajev"
                required
              />
            </label>

            <label>
              Novo geslo
              <span className="profile-password-input-wrap">
                <input
                  type={isNewPasswordVisible ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength="6"
                  placeholder="Pusti prazno, če ga ne želiš spremeniti"
                />
                <button
                  type="button"
                  className="icon-button tap profile-eye-btn"
                  onClick={() => setIsNewPasswordVisible((visible) => !visible)}
                  aria-label={isNewPasswordVisible ? 'Skrij geslo' : 'Pokaži geslo'}
                  title={isNewPasswordVisible ? 'Skrij geslo' : 'Pokaži geslo'}
                >
                  👁
                </button>
              </span>
            </label>

            {newPassword && (
              <label>
                Ponovi novo geslo
                <input
                  type={isNewPasswordVisible ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength="6"
                />
              </label>
            )}

            {status && <p className={`auth-message ${status.type}`}>{status.text}</p>}

            <div className="profile-edit-actions">
              <button type="button" className="secondary-button" onClick={handleCancelEditing} disabled={isSaving}>Prekliči</button>
              <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? 'Shranjujem ...' : 'Shrani'}</button>
            </div>
          </form>
        )}
      </section>

      <section className="profile-section profile-danger-section">
        <h2>Izbris profila</h2>
        <p>Izbris računa je trajen in odstrani vse tvoje zapiske ter podatke.</p>
        {deleteError && <p className="auth-message error">{deleteError}</p>}
        <button type="button" className="destructive-button" onClick={handleDeleteAccount} disabled={isDeleting}>
          {isDeleting ? 'Brišem ...' : 'Izbriši račun'}
        </button>
      </section>
    </main>
  )
}

export default Profile
