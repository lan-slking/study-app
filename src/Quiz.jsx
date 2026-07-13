import { useEffect, useState } from 'react'
import ProgressRing from './ProgressRing.jsx'

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// Quiz walks through a set of Gemini-generated questions for one note, one at
// a time: answer, get graded with an explanation, then move on. At the end it
// shows a score and which sections of the note to review.
function Quiz({ note, subjectColor, onClose, onFinished }) {
  // 'loading' | 'ready' | 'error' — covers fetching the quiz itself.
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [questions, setQuestions] = useState([])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [shortAnswerInput, setShortAnswerInput] = useState('')
  const [isGrading, setIsGrading] = useState(false)
  const [gradeError, setGradeError] = useState(null)
  // Set once the current question has been answered: { correct, explanation }
  const [feedback, setFeedback] = useState(null)
  // One entry per answered question so far: { section, correct }
  const [results, setResults] = useState([])
  const [isFinished, setIsFinished] = useState(false)

  useEffect(() => {
    loadQuiz()
    // Only reload when the note itself changes — loadQuiz is stable enough
    // for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  async function loadQuiz() {
    setStatus('loading')
    setLoadError(null)
    try {
      const response = await fetch(`/api/notes/${note.id}/quiz`, { method: 'POST' })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
      }
      if (!response.ok) {
        throw new Error(data.error || 'Kviza ni bilo mogoče ustvariti.')
      }
      setQuestions(data.questions)
      setStatus('ready')
    } catch (err) {
      setLoadError(err.message || 'Kviza ni bilo mogoče ustvariti.')
      setStatus('error')
    }
  }

  const currentQuestion = questions[currentIndex]

  async function handleSubmitAnswer() {
    if (!currentQuestion) return

    if (currentQuestion.type === 'multiple_choice') {
      const correct = selectedOption === currentQuestion.correctIndex
      setFeedback({ correct, explanation: currentQuestion.explanation })
      setResults((prev) => [...prev, { section: currentQuestion.section, correct }])
      return
    }

    // short_answer — ask the backend to grade it (handles paraphrasing).
    setIsGrading(true)
    setGradeError(null)
    try {
      const response = await fetch('/api/grade-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentQuestion.question,
          expectedAnswer: currentQuestion.answer,
          userAnswer: shortAnswerInput,
        }),
      })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči.')
      }
      if (!response.ok) {
        throw new Error(data.error || 'Odgovora ni bilo mogoče oceniti.')
      }
      setFeedback({ correct: data.correct, explanation: data.explanation })
      setResults((prev) => [...prev, { section: currentQuestion.section, correct: data.correct }])
    } catch (err) {
      setGradeError(err.message || 'Odgovora ni bilo mogoče oceniti.')
    } finally {
      setIsGrading(false)
    }
  }

  function handleNext() {
    setFeedback(null)
    setGradeError(null)
    setSelectedOption(null)
    setShortAnswerInput('')

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1)
    } else {
      const correctCount = results.filter((r) => r.correct).length
      onFinished?.(correctCount, questions.length)
      setIsFinished(true)
    }
  }

  function handleRestart() {
    setCurrentIndex(0)
    setSelectedOption(null)
    setShortAnswerInput('')
    setFeedback(null)
    setGradeError(null)
    setResults([])
    setIsFinished(false)
    loadQuiz()
  }

  if (status === 'loading') {
    return (
      <main className="quiz-screen status-panel">
        <div className="processing-spinner" />
        <p className="status-message">Ustvarjam kviz iz tvojega zapiska ...</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="quiz-screen status-panel">
        <p className="status-message status-message-error">{loadError}</p>
        <div className="status-actions">
          <button type="button" className="primary-button" onClick={loadQuiz}>
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
      <main className="quiz-screen status-panel">
        <ProgressRing correct={correctCount} total={questions.length} color={subjectColor} size={88} strokeWidth={7} />
        <h1 className="quiz-results-heading">Kviz končan! 🎉</h1>
        <p className="status-message">
          {correctCount} / {questions.length} pravilnih odgovorov
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
            Nov kviz
          </button>
        </div>
      </main>
    )
  }

  const progressPercent = (currentIndex / questions.length) * 100

  return (
    <main className="quiz-screen">
      <div className="quiz-topbar">
        <button type="button" className="icon-button tap" onClick={onClose} aria-label="Zapri">
          ✕
        </button>
        <span className="quiz-counter">
          {currentIndex + 1} / {questions.length}
        </span>
        <div className="icon-button-spacer" />
      </div>

      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="quiz-body anim-slide-in-right" key={currentIndex}>
        <span className="quiz-topic">{currentQuestion.section}</span>
        <h1 className="quiz-question">{currentQuestion.question}</h1>

        {currentQuestion.type === 'multiple_choice' ? (
          <div className="quiz-options">
            {currentQuestion.options.map((option, index) => {
              let optionClass = 'quiz-option tap'
              if (feedback) {
                if (index === currentQuestion.correctIndex) optionClass += ' correct'
                else if (index === selectedOption) optionClass += ' incorrect'
              } else if (index === selectedOption) {
                optionClass += ' selected'
              }
              return (
                <button
                  key={index}
                  type="button"
                  className={optionClass}
                  disabled={!!feedback}
                  onClick={() => setSelectedOption(index)}
                >
                  <span className="quiz-option-letter">{OPTION_LETTERS[index]}</span>
                  <span className="quiz-option-text">{option}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <input
            type="text"
            className="text-input"
            value={shortAnswerInput}
            onChange={(e) => setShortAnswerInput(e.target.value)}
            disabled={!!feedback || isGrading}
            placeholder="Vnesi odgovor..."
          />
        )}

        {gradeError && <p className="status-message-error">{gradeError}</p>}

        {feedback && (
          <div className={`quiz-feedback ${feedback.correct ? 'correct' : 'incorrect'}`}>
            <p className="quiz-feedback-title">{feedback.correct ? 'Pravilno! ✅' : 'Napačno.'}</p>
            <p>{feedback.explanation}</p>
          </div>
        )}
      </div>

      <div className="fixed-footer">
        {feedback ? (
          <button type="button" className="primary-button" onClick={handleNext}>
            {currentIndex + 1 < questions.length ? 'Naprej →' : 'Zaključi kviz →'}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmitAnswer}
            disabled={
              isGrading ||
              (currentQuestion.type === 'multiple_choice' ? selectedOption === null : !shortAnswerInput.trim())
            }
          >
            {isGrading ? 'Ocenjujem...' : 'Potrdi odgovor'}
          </button>
        )}
      </div>
    </main>
  )
}

export default Quiz
