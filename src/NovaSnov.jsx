import { useEffect, useRef, useState } from 'react'
import { SUBJECTS, subjectMeta, customSubjectsInUse } from './subjects.js'
import { compressImage } from './compressImage.js'
import { apiFetch } from './apiFetch.js'

const TOTAL_STEPS = 4
const PAGE_SEPARATOR = '\n\n---\n\n'

const OCR_MESSAGES = [
  'Berem tvojo pisavo... 👀',
  'Ločim bistvo od nepomembnega... 🧠',
  'Urejam zapiske... ✨',
]

const PREGENERATION_MESSAGES = [
  'Pripravljam še kviz in kartice... 🧠',
  'Sestavljam naloge za dopolnjevanje... ✍️',
  'Skoraj gotovo... 🎉',
]

const MODES = [
  { key: 'full', emoji: '📄', title: 'Celotni zapiski', subtitle: 'Vse ohranjeno, lepo urejeno.' },
  { key: 'summary', emoji: '✂️', title: 'Povzetek', subtitle: 'Krajše, samo bistvo.' },
]

let nextPhotoId = 0

// NovaSnov is the guided "create a study topic" flow: subject, title, add
// photos, pick a mode, then process everything into one note. Nothing is
// saved to the backend until the very end (POST /api/notes) — up to that
// point this is all local wizard state.
function NovaSnov({ notes, onCreated, onCancel }) {
  const [step, setStep] = useState(1)
  const [subjectKey, setSubjectKey] = useState('')
  const [showCustomSubject, setShowCustomSubject] = useState(false)
  const [customSubjectDraft, setCustomSubjectDraft] = useState('')
  const [title, setTitle] = useState('')
  const [showTestDate, setShowTestDate] = useState(false)
  const [testDate, setTestDate] = useState('')
  const [photos, setPhotos] = useState([]) // { id, file, previewUrl }
  const [mode, setMode] = useState('full')
  const [phase, setPhase] = useState('form') // 'form' | 'processing' | 'error'
  const [processingStage, setProcessingStage] = useState('ocr') // 'ocr' | 'pregenerating'
  const [errorMessage, setErrorMessage] = useState(null)
  const [messageIndex, setMessageIndex] = useState(0)

  const processingMessages = processingStage === 'ocr' ? OCR_MESSAGES : PREGENERATION_MESSAGES

  const fileInputRef = useRef(null)
  const customSubjects = customSubjectsInUse(notes)

  // Revoke object URLs for any remaining previews when the wizard unmounts —
  // read through a ref so the cleanup sees the latest photos, not whatever
  // was current when this effect first ran.
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    }
  }, [])

  useEffect(() => {
    if (phase !== 'processing') return
    const timer = setInterval(() => {
      setMessageIndex((i) => (i + 1) % processingMessages.length)
    }, 1900)
    return () => clearInterval(timer)
  }, [phase, processingMessages])

  function handleSelectSubject(key) {
    setSubjectKey(key)
    setShowCustomSubject(false)
  }

  function handleOpenCustomSubject() {
    setShowCustomSubject(true)
    setSubjectKey(customSubjectDraft.trim())
  }

  function handleCustomSubjectChange(value) {
    setCustomSubjectDraft(value)
    setSubjectKey(value.trim())
  }

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files)
    e.target.value = ''
    if (files.length === 0) return

    const newPhotos = files.map((file) => ({
      id: nextPhotoId++,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [...prev, ...newPhotos])
  }

  function handleRemovePhoto(id) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }

  async function handleCreate() {
    setPhase('processing')
    setProcessingStage('ocr')
    setMessageIndex(0)
    setErrorMessage(null)

    try {
      const pageContents = []
      for (const photo of photos) {
        let imageBlob
        try {
          imageBlob = await compressImage(photo.file)
        } catch {
          imageBlob = photo.file
        }

        const formData = new FormData()
        formData.append('image', imageBlob, photo.file.name)
        formData.append('mode', mode)

        const response = await apiFetch('/api/process-image', { method: 'POST', body: formData })
        let data
        try {
          data = await response.json()
        } catch {
          throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
        }
        if (!response.ok) {
          throw new Error(data.error || 'Pri obdelavi ene od fotografij je prišlo do napake.')
        }
        pageContents.push(data.notes)
      }

      const content = pageContents.join(PAGE_SEPARATOR)

      const createResponse = await apiFetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          subject: subjectKey,
          mode,
          content,
          testDate: testDate || null,
        }),
      })
      let note
      try {
        note = await createResponse.json()
      } catch {
        throw new Error('Strežnika ni bilo mogoče doseči. Preveri, ali backend teče.')
      }
      if (!createResponse.ok) {
        throw new Error(note.error || 'Snovi ni bilo mogoče shraniti.')
      }

      // Study content now generates in the background immediately after save.
      // opening them from Zapiski feels instant. Never blocks navigation —
      // if one (or all) fail, those study modes just fall back to generating
      // on demand when opened, same as before this existed.
      onCreated(note)
    } catch (err) {
      setErrorMessage(err.message || 'Nekaj je šlo narobe. Poskusi znova.')
      setPhase('error')
    }
  }

  if (phase === 'processing') {
    return (
      <main className="wizard processing-screen">
        <div className="processing-spinner" />
        <p key={messageIndex} className="processing-message anim-pop-in">
          {processingMessages[messageIndex]}
        </p>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main className="wizard status-panel">
        <p className="status-message status-message-error">{errorMessage}</p>
        <div className="status-actions">
          <button type="button" className="primary-button" onClick={handleCreate}>
            Poskusi znova
          </button>
          <button type="button" className="secondary-button tap" onClick={() => setPhase('form')}>
            Nazaj na fotografije
          </button>
        </div>
      </main>
    )
  }

  const canGoNext =
    (step === 1 && Boolean(subjectKey)) ||
    (step === 2 && Boolean(title.trim())) ||
    (step === 3 && photos.length > 0) ||
    step === 4

  function handleBack() {
    if (step === 1) {
      onCancel()
    } else {
      setStep(step - 1)
    }
  }

  function handleNext() {
    if (step < TOTAL_STEPS) {
      setStep(step + 1)
    } else {
      handleCreate()
    }
  }

  const selectedSubject = subjectMeta(subjectKey)

  return (
    <main className="wizard">
      <div className="wizard-topbar">
        <button type="button" className="icon-button tap" onClick={handleBack} aria-label="Nazaj">
          ←
        </button>
        <span className="wizard-step-label">
          Korak {step} / {TOTAL_STEPS}
        </span>
        <button type="button" className="icon-button tap" onClick={onCancel} aria-label="Zapri">
          ✕
        </button>
      </div>

      <div className="segmented-progress">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} className="segmented-progress-track">
            <div className="segmented-progress-fill" style={{ width: i < step ? '100%' : '0%' }} />
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="wizard-step anim-slide-in-right">
          <h1>Kateri predmet?</h1>
          <p className="wizard-subtitle">Izberi enega, ali dodaj svojega.</p>

          <div className="wizard-subject-grid">
            {SUBJECTS.map((s) => {
              const selected = !showCustomSubject && subjectKey === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  className="subject-chip-button tap"
                  style={
                    selected
                      ? {
                          background: `color-mix(in oklab, var(--${s.key}) 25%, transparent)`,
                          color: `var(--${s.key})`,
                          boxShadow: `0 0 0 2px var(--${s.key}), 0 8px 24px -12px var(--${s.key})`,
                        }
                      : { background: 'var(--card)', color: 'var(--foreground)', boxShadow: 'var(--shadow-card)' }
                  }
                  onClick={() => handleSelectSubject(s.key)}
                >
                  <span className="subject-chip-emoji">{s.emoji}</span>
                  {s.label}
                </button>
              )
            })}

            {customSubjects.map((s) => {
              const selected = !showCustomSubject && subjectKey === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  className="subject-chip-button tap"
                  style={
                    selected
                      ? {
                          background: `color-mix(in oklab, ${s.color} 25%, transparent)`,
                          color: s.color,
                          boxShadow: `0 0 0 2px ${s.color}, 0 8px 24px -12px ${s.color}`,
                        }
                      : { background: 'var(--card)', color: 'var(--foreground)', boxShadow: 'var(--shadow-card)' }
                  }
                  onClick={() => handleSelectSubject(s.key)}
                >
                  <span className="subject-chip-emoji">{s.emoji}</span>
                  {s.label}
                </button>
              )
            })}

            <button
              type="button"
              className="subject-chip-button tap"
              style={
                showCustomSubject
                  ? {
                      background: 'color-mix(in oklab, var(--primary) 25%, transparent)',
                      color: 'var(--primary)',
                      boxShadow: '0 0 0 2px var(--primary), 0 8px 24px -12px var(--primary)',
                    }
                  : { background: 'var(--secondary)', color: 'var(--foreground)', boxShadow: 'var(--shadow-card)' }
              }
              onClick={handleOpenCustomSubject}
            >
              <span className="subject-chip-emoji">➕</span>
              Drugo
            </button>
          </div>

          {showCustomSubject && (
            <input
              autoFocus
              type="text"
              className="text-input"
              placeholder="Vpiši predmet, npr. Robotika"
              value={customSubjectDraft}
              onChange={(e) => handleCustomSubjectChange(e.target.value)}
            />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="wizard-step anim-slide-in-right">
          {subjectKey && (
            <span
              className="wizard-subject-badge"
              style={{ background: `color-mix(in oklab, ${selectedSubject.color} 20%, transparent)`, color: selectedSubject.color }}
            >
              {selectedSubject.emoji} {selectedSubject.label}
            </span>
          )}
          <h1>Kako se imenuje snov?</h1>
          <p className="wizard-subtitle">Nekaj, kar si boš zapomnil/a.</p>

          <input
            autoFocus
            type="text"
            className="text-input"
            placeholder="npr. Newtonovi zakoni"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {showTestDate ? (
            <>
              <label className="wizard-label" htmlFor="wizard-test-date">
                Datum testa
              </label>
              <input
                id="wizard-test-date"
                type="date"
                className="text-input"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
              />
            </>
          ) : (
            <button type="button" className="text-link-button tap" onClick={() => setShowTestDate(true)}>
              + Dodaj datum testa
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="wizard-step anim-slide-in-right">
          <h1>Dodaj fotografije</h1>
          <p className="wizard-subtitle">Slikaj strani zapiskov, po vrsti.</p>

          <button type="button" className="photo-dropzone tap" onClick={() => fileInputRef.current?.click()}>
            <span className="photo-dropzone-icon">📷</span>
            <span>Dotakni se za fotografijo</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            style={{ display: 'none' }}
          />

          {photos.length > 0 && (
            <ul className="photo-preview-grid">
              {photos.map((photo, index) => (
                <li key={photo.id} className="photo-preview">
                  <img src={photo.previewUrl} alt={`Stran ${index + 1}`} />
                  <span className="photo-preview-badge">{index + 1}</span>
                  <button
                    type="button"
                    className="photo-preview-remove"
                    onClick={() => handleRemovePhoto(photo.id)}
                    aria-label={`Odstrani stran ${index + 1}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="wizard-step anim-slide-in-right">
          <h1>Kako naj uredim zapiske?</h1>
          <p className="wizard-subtitle">Oboje lahko kasneje urediš ročno.</p>

          <div className="mode-option-list">
            {MODES.map((m) => {
              const selected = mode === m.key
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`mode-option tap ${selected ? 'selected' : ''}`}
                  onClick={() => setMode(m.key)}
                >
                  <span className="mode-option-emoji">{m.emoji}</span>
                  <span className="mode-option-text">
                    <span className="mode-option-title">{m.title}</span>
                    <span className="mode-option-subtitle">{m.subtitle}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="fixed-footer">
        <button type="button" className="primary-button" disabled={!canGoNext} onClick={handleNext}>
          {step < TOTAL_STEPS ? 'Naprej →' : 'Ustvari zapiske'}
        </button>
      </div>
    </main>
  )
}

export default NovaSnov
