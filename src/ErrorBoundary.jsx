import { Component } from 'react'

// Catches any rendering error anywhere below it in the tree and shows a
// friendly message instead of an unhandled crash leaving a blank page.
// This has to be a class component — React only supports error boundaries
// via getDerivedStateFromError/componentDidCatch, there's no hook for it.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error caught by ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-status app-status-error">
          <div>
            <p>Ojoj, nekaj je šlo narobe.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Osveži stran
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
