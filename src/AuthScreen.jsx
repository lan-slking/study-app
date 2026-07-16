import { useState } from 'react'
import { signIn, signUp } from './auth.js'

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus(null)

    try {
      const action = mode === 'signup' ? signUp : signIn
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Povezava s prijavo traja predolgo. Poskusi znova.')), 15000)
      })
      const result = await Promise.race([isSignup ? action(email.trim(), password, username.trim().toLowerCase()) : action(email.trim(), password), timeout])
      const session = mode === 'signup' ? result.session : result
      if (session) {
        onAuthenticated(session)
        return
      }
      if (mode === 'signup') {
        setStatus({ type: 'success', text: 'Preveri e-pošto in potrdi račun, nato se prijavi.' })
      }
    } catch (error) {
      setStatus({ type: 'error', text: error.message || 'Prijave ni bilo mogoče dokončati.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isSignup = mode === 'signup'
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand"><span>P</span> Piflar</div>
        <h1>{isSignup ? 'Ustvari svoj račun' : 'Dobrodošel/a nazaj'}</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          {isSignup && <label>Uporabniško ime<input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" pattern="[a-z0-9_]{3,20}" title="3–20 malih črk, številk ali podčrtajev" required /></label>}
          <label>E-pošta<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Geslo<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} minLength="6" required /></label>
          {status && <p className={`auth-message ${status.type}`}>{status.text}</p>}
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Počakaj ...' : isSignup ? 'Ustvari račun' : 'Prijavi se'}</button>
        </form>
        <button type="button" className="auth-switch" onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setStatus(null) }}>
          {isSignup ? 'Že imaš račun? Prijavi se' : 'Še nimaš računa? Ustvari ga'}
        </button>
      </section>
    </main>
  )
}

export default AuthScreen
