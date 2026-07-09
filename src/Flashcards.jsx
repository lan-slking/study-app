import { useEffect, useState } from 'react'

// Flashcards shows Gemini-generated term/definition pairs for one note as
// flippable cards. Cards marked "ne znam" (don't know) come back in the next
// round; the session ends once every card has been marked "znam" (know it).
function Flashcards({ note, onClose }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState(null)

  const [totalCount, setTotalCount] = useState(0)
  const [roundNumber, setRoundNumber] = useState(1)
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
      setRoundNumber(1)
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
      setRoundNumber(roundNumber + 1)
      setIsFlipped(false)
    } else {
      setIsComplete(true)
    }
  }

  if (status === 'loading') {
    return (
      <div className="study-panel">
        <p className="study-status">Ustvarjam kartončke iz tvojega zapiska...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="study-panel">
        <p className="study-status study-status-error">{loadError}</p>
        <div className="study-panel-actions">
          <button type="button" onClick={loadCards}>Poskusi znova</button>
          <button type="button" onClick={onClose}>Nazaj na zapisek</button>
        </div>
      </div>
    )
  }

  if (isComplete) {
    return (
      <div className="study-panel">
        <h2>Vse kartončke znaš!</h2>
        <p>Pregledal si {totalCount} kartončkov.</p>
        <div className="study-panel-actions">
          <button type="button" onClick={loadCards}>Znova</button>
          <button type="button" onClick={onClose}>Nazaj na zapisek</button>
        </div>
      </div>
    )
  }

  const card = currentRound[cardIndex]

  return (
    <div className="study-panel">
      <div className="flashcard-progress">
        Krog {roundNumber} · kartonček {cardIndex + 1} / {currentRound.length}
      </div>

      <button
        type="button"
        className={`flashcard ${isFlipped ? 'flipped' : ''}`}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        {isFlipped ? card.definition : card.term}
      </button>

      {!isFlipped ? (
        <p className="flashcard-hint">Klikni kartonček, da vidiš odgovor.</p>
      ) : (
        <div className="flashcard-answer-buttons">
          <button type="button" className="flashcard-dont-know" onClick={() => handleAnswer(false)}>
            Ne znam
          </button>
          <button type="button" className="flashcard-know" onClick={() => handleAnswer(true)}>
            Znam
          </button>
        </div>
      )}

      <div className="study-panel-actions">
        <button type="button" onClick={onClose}>Nazaj na zapisek</button>
      </div>
    </div>
  )
}

export default Flashcards
