import { useState } from 'react'
import { getSessionEmail, updateEmail, updatePassword } from './auth.js'
import { updateUsername, deleteAccount } from './profile.js'

function Profile({ profile, onBack, onUploadAvatar, onUsernameUpdated, onAccountDeleted }) {
  const [username, setUsername] = useState(profile?.username ?? '')
  const [email, setEmail] = useState(getSessionEmail() ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [usernameStatus, setUsernameStatus] = useState(null)
  const [emailStatus, setEmailStatus] = useState(null)
  const [passwordStatus, setPasswordStatus] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const [isSavingUsername, setIsSavingUsername] = useState(false)
  const [isSavingEmail, setIsSavingEmail] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleSaveUsername(event) {
    event.preventDefault()
    setUsernameStatus(null)
    setIsSavingUsername(true)
    try {
      const updated = await updateUsername(username.trim().toLowerCase())
      onUsernameUpdated(updated)
      setUsernameStatus({ type: 'success', text: 'Uporabniško ime posodobljeno.' })
    } catch (error) {
      setUsernameStatus({ type: 'error', text: error.message || 'Uporabniškega imena ni bilo mogoče spremeniti.' })
    } finally {
      setIsSavingUsername(false)
    }
  }

  async function handleSaveEmail(event) {
    event.preventDefault()
    setEmailStatus(null)
    setIsSavingEmail(true)
    try {
      await updateEmail(email.trim())
      setEmailStatus({ type: 'success', text: 'Preveri novo e-pošto in potrdi spremembo, da začne veljati.' })
    } catch (error) {
      setEmailStatus({ type: 'error', text: error.message || 'E-pošte ni bilo mogoče spremeniti.' })
    } finally {
      setIsSavingEmail(false)
    }
  }

  async function handleSavePassword(event) {
    event.preventDefault()
    setPasswordStatus(null)
    if (password.length < 6) {
      setPasswordStatus({ type: 'error', text: 'Geslo naj ima vsaj 6 znakov.' })
      return
    }
    if (password !== confirmPassword) {
      setPasswordStatus({ type: 'error', text: 'Gesli se ne ujemata.' })
      return
    }
    setIsSavingPassword(true)
    try {
      await updatePassword(password)
      setPassword('')
      setConfirmPassword('')
      setPasswordStatus({ type: 'success', text: 'Geslo posodobljeno.' })
    } catch (error) {
      setPasswordStatus({ type: 'error', text: error.message || 'Gesla ni bilo mogoče spremeniti.' })
    } finally {
      setIsSavingPassword(false)
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

      <section className="profile-section profile-avatar-section">
        <label className="profile-avatar profile-avatar-lg" title="Spremeni profilno sliko">
          {profile?.avatar_path ? (
            <img src={profile.avatar_url} alt="Profilna slika" />
          ) : (
            <span>{profile?.username?.[0]?.toUpperCase() ?? 'P'}</span>
          )}
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUploadAvatar(event.target.files[0])} />
        </label>
        <p>Klikni na sliko za spremembo profilne slike.</p>
      </section>

      <form className="profile-section auth-form" onSubmit={handleSaveUsername}>
        <h2>Uporabniško ime</h2>
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
        {usernameStatus && <p className={`auth-message ${usernameStatus.type}`}>{usernameStatus.text}</p>}
        <button className="primary-button" type="submit" disabled={isSavingUsername || username.trim() === profile?.username}>
          {isSavingUsername ? 'Shranjujem ...' : 'Shrani uporabniško ime'}
        </button>
      </form>

      <form className="profile-section auth-form" onSubmit={handleSaveEmail}>
        <h2>E-pošta</h2>
        <label>
          E-pošta
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {emailStatus && <p className={`auth-message ${emailStatus.type}`}>{emailStatus.text}</p>}
        <button className="primary-button" type="submit" disabled={isSavingEmail}>
          {isSavingEmail ? 'Shranjujem ...' : 'Shrani e-pošto'}
        </button>
      </form>

      <form className="profile-section auth-form" onSubmit={handleSavePassword}>
        <h2>Geslo</h2>
        <label>
          Novo geslo
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength="6" />
        </label>
        <label>
          Ponovi novo geslo
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength="6" />
        </label>
        {passwordStatus && <p className={`auth-message ${passwordStatus.type}`}>{passwordStatus.text}</p>}
        <button className="primary-button" type="submit" disabled={isSavingPassword || !password}>
          {isSavingPassword ? 'Shranjujem ...' : 'Spremeni geslo'}
        </button>
      </form>

      <section className="profile-section profile-danger-section">
        <h2>Nevarno območje</h2>
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
