import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// A "Deli" link (see Zapiski.jsx) points at /shared/:token — no router
// library needed for one static route, just a plain path check at load time
// that swaps in the read-only SharedNote screen instead of the normal app.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
