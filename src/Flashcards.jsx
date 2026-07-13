import { useEffect, useState } from 'react'

// Flashcards shows Gemini-generated term/definition pairs for one note as
// flippable cards. Cards marked "ne znam" (don't know) come back in the next
// round; the session ends once every card has been marked "znam" (know it).
function Flashcards({ note, onClose }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState(null)

  const [totalCount, setTotalCount] = useState(0)
  const [knownCount, setKnownCount] = useState(0)
  const [currentRound, setCurrentRound] = useState([])
  const [nextRound, setNextRound] = useState([])
  const [cardIndex, setCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    loadCards()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  async function loadCards() {
    setStatus('loading')
    setLoadError(null)
    try {
      const response = await fetch(`/api/notes/${note.id}/flashcards`, { method: 'POST' })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
      }
      if (!response.ok) {
        throw new Error(data.error || 'Kartončkov ni bilo mogoče ustvariti.')
      }
      setTotalCount(data.cards.length)
      setKnownCount(0)
      setCurrentRound(data.cards)
      setNextRound([])
      setCardIndex(0)
      setIsFlipped(false)
      setIsComplete(false)
      setStatus('ready')
    } catch (err) {
      setLoadError(err.message || 'Kartončkov ni bilo mogoče ustvariti.')
      setStatus('error')
    }
  }

  function handleAnswer(knewIt) {
    const currentCard = currentRound[cardIndex]
    const updatedNextRound = knewIt ? nextRound : [...nextRound, currentCard]
    if (knewIt) setKnownCount((n) => n + 1)

    if (cardIndex + 1 < currentRound.length) {
      setNextRound(updatedNextRound)
      setCardIndex(cardIndex + 1)
      setIsFlipped(false)
      return
    }

    // Round finished — either start the next round with the "ne znam" pile,
    // or finish if everything has been marked "znam".
    if (updatedNextRound.length > 0) {
      setCurrentRound(updatedNextRound)
      setNextRound([])
      setCardIndex(0)
      setIsFlipped(false)
    } else {
      setIsComplete(true)
    }
  }

  if (status === 'loading') {
    return (
      <main className="kartice-screen status-panel">
        <div className="processing-spinner" />
        <p className="status-message">Ustvarjam kartončke iz tvojega zapiska ...</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="kartice-screen status-panel">
        <p className="status-message status-message-error">{loadError}</p>
        <div className="status-actions">
          <button type="button" className="primary-button" onClick={loadCards}>
            Poskusi znova
          </button>
          <button type="button" className="secondary-button tap" onClick={onClose}>
            Nazaj na zapisek
          </button>
        </div>
      </main>
    )
  }

  if (isComplete) {
    return (
      <main className="kartice-screen status-panel">
        <h1 className="quiz-results-heading">Vse kartončke znaš! 🎉</h1>
        <p className="status-message">Pregledal/a si {totalCount} kartončkov.</p>
        <div className="status-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Nazaj na zapisek
          </button>
          <button type="button" className="secondary-button tap" onClick={loadCards}>
            Znova
          </button>
        </div>
      </main>
    )
  }

  const card = currentRound[cardIndex]
  const progressPercent = (cardIndex / currentRound.length) * 100

  return (
    <main className="kartice-screen">
      <div className="kartice-topbar">
        <button type="button" className="icon-button tap" onClick={onClose} aria-label="Zapri">
          ✕
        </button>
        <div className="kartice-counters">
          <span className="kartice-known">✅ {knownCount}</span>
          <span className="kartice-repeat">🔁 {nextRound.length}</span>
        </div>
        <div className="icon-button-spacer" />
      </div>

      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="flip-card-stage">
        <div className="flip-card-shadow flip-card-shadow-1" />
        <div className="flip-card-shadow flip-card-shadow-2" />
        <button
          type="button"
          className="flip-card anim-pop-in"
          onClick={() => setIsFlipped((v) => !v)}
          key={`${cardIndex}-${nextRound.length}`}
        >
          <div className="flip-card-inner" style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)' }}>
            <div className="flip-card-face flip-card-face-front">
              <span className="flip-card-face-label">Pojem</span>
              <div className="flip-card-face-content">{card.term}</div>
              <span className="flip-card-face-brand">Piflar</span>
            </div>
            <div className="flip-card-face flip-card-face-back">
              <span className="flip-card-face-label">Razlaga</span>
              <div className="flip-card-face-content">{card.definition}</div>
              <span className="flip-card-face-brand">Piflar</span>
            </div>
          </div>
        </button>
        <p className="flip-card-hint">Klikni za razlago ↺</p>
      </div>

      <div className="kartice-actions">
        <button type="button" className="action-button action-button-secondary tap" onClick={() => handleAnswer(false)}>
          🔁 Še ne
        </button>
        <button type="button" className="action-button action-button-success tap" onClick={() => handleAnswer(true)}>
          ✅ Znam
        </button>
      </div>
    </main>
  )
}

export default Flashcards
