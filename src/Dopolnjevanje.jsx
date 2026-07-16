import { useEffect, useState } from 'react'
import ProgressRing from './ProgressRing.jsx'
import { isAnswerCorrect } from './answerMatching.js'
import { apiFetch } from './apiFetch.js'

// Dopolnjevanje (fill-in-the-blank) walks through Gemini-generated sentences
// with a key term blanked out, one at a time — same instant-feedback and
// final-score pattern as Quiz, just with client-side fuzzy answer matching
// instead of a Gemini grading call (there's exactly one right word here, so
// semantic grading isn't needed — see answerMatching.js).
function Dopolnjevanje({ note, subjectColor, onClose, onFinished }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [loadError, setLoadError] = useState(null)
  const [exercises, setExercises] = useState([])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answerInput, setAnswerInput] = useState('')
  const [feedback, setFeedback] = useState(null) // { correct, explanation }
  const [results, setResults] = useState([]) // { section, correct }
  const [isFinished, setIsFinished] = useState(false)

  useEffect(() => {
    loadExercises()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  async function loadExercises() {
    setStatus('loading')
    setLoadError(null)
    try {
      const response = await apiFetch(`/api/notes/${note.id}/fill-blank`, { method: 'POST' })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
      }
      if (!response.ok) {
        throw new Error(data.error || 'Nalog dopolnjevanja ni bilo mogoče ustvariti.')
      }
      setExercises(data.exercises)
      setStatus('ready')
    } catch (err) {
      setLoadError(err.message || 'Nalog dopolnjevanja ni bilo mogoče ustvariti.')
      setStatus('error')
    }
  }

  const currentExercise = exercises[currentIndex]

  function handleSubmitAnswer() {
    if (!currentExercise) return
    const correct = isAnswerCorrect(answerInput, currentExercise.answer)
    setFeedback({ correct, explanation: currentExercise.explanation })
    setResults((prev) => [...prev, { section: currentExercise.section, correct }])
  }

  function handleNext() {
    setFeedback(null)
    setAnswerInput('')

    if (currentIndex + 1 < exercises.length) {
      setCurrentIndex(currentIndex + 1)
    } else {
      const correctCount = results.filter((r) => r.correct).length
      onFinished?.(correctCount, exercises.length)
      setIsFinished(true)
    }
  }

  function handleRestart() {
    setCurrentIndex(0)
    setAnswerInput('')
    setFeedback(null)
    setResults([])
    setIsFinished(false)
    loadExercises()
  }

  if (status === 'loading') {
    return (
      <main className="dopolnjevanje-screen status-panel">
        <div className="processing-spinner" />
        <p className="status-message">Sestavljam naloge dopolnjevanja iz tvojega zapiska ...</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="dopolnjevanje-screen status-panel">
        <p className="status-message status-message-error">{loadError}</p>
        <div className="status-actions">
          <button type="button" className="primary-button" onClick={loadExercises}>
            Poskusi znova
          </button>
          <button type="button" className="secondary-button tap" onClick={onClose}>
            Nazaj na zapisek
          </button>
        </div>
      </main>
    )
  }

  if (isFinished) {
    const correctCount = results.filter((r) => r.correct).length
    const missedSections = [...new Set(results.filter((r) => !r.correct).map((r) => r.section))]

    return (
      <main className="dopolnjevanje-screen status-panel">
        <ProgressRing correct={correctCount} total={exercises.length} color={subjectColor} size={88} strokeWidth={7} />
        <h1 className="quiz-results-heading">Dopolnjevanje končano! 🎉</h1>
        <p className="status-message">
          {correctCount} / {exercises.length} pravilnih odgovorov
        </p>

        {missedSections.length > 0 && (
          <div className="dot-list-card">
            <p className="dot-list-title">Ponovi te dele zapiska:</p>
            <ul className="dot-list">
              {missedSections.map((section) => (
                <li key={section}>{section}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="status-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Nazaj na zapisek
          </button>
          <button type="button" className="secondary-button tap" onClick={handleRestart}>
            Znova
          </button>
        </div>
      </main>
    )
  }

  const progressPercent = (currentIndex / exercises.length) * 100
  // Gemini is asked for exactly "___" but sometimes returns a longer run of
  // underscores — split on any run of them so a stray "__________" doesn't
  // leave leftover underscores dangling in the rendered sentence.
  const [before, after] = currentExercise.sentence.split(/_+/)

  return (
    <main className="dopolnjevanje-screen">
      <div className="quiz-topbar">
        <button type="button" className="icon-button tap" onClick={onClose} aria-label="Zapri">
          ✕
        </button>
        <span className="quiz-counter">
          {currentIndex + 1} / {exercises.length}
        </span>
        <div className="icon-button-spacer" />
      </div>

      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="quiz-body anim-slide-in-right" key={currentIndex}>
        <span className="quiz-topic">{currentExercise.section}</span>
        <p className="fill-blank-sentence">
          {before}
          <span className="fill-blank-gap">___</span>
          {after}
        </p>

        <input
          type="text"
          className="text-input"
          value={answerInput}
          onChange={(e) => setAnswerInput(e.target.value)}
          disabled={!!feedback}
          placeholder="Vnesi manjkajočo besedo..."
          autoFocus
        />

        {feedback && (
          <div className={`quiz-feedback ${feedback.correct ? 'correct' : 'incorrect'}`}>
            <p className="quiz-feedback-title">{feedback.correct ? 'Pravilno! ✅' : `Napačno. Pravilen odgovor: ${currentExercise.answer}`}</p>
            <p>{feedback.explanation}</p>
          </div>
        )}
      </div>

      <div className="fixed-footer">
        {feedback ? (
          <button type="button" className="primary-button" onClick={handleNext}>
            {currentIndex + 1 < exercises.length ? 'Naprej →' : 'Zaključi →'}
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={handleSubmitAnswer} disabled={!answerInput.trim()}>
            Potrdi odgovor
          </button>
        )}
      </div>
    </main>
  )
}

export default Dopolnjevanje
