import { useMemo } from 'react'

const COLORS = ['#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']
const PIECE_COUNT = 40

// A short celebratory confetti burst — purely decorative, renders itself and
// lets the parent decide how long to keep it mounted (see the showConfetti
// pattern in Quiz.jsx / Flashcards.jsx).
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.4,
        duration: 1.8 + Math.random() * 1.2,
      })),
    [],
  )

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
          }}
        />
      ))}
    </div>
  )
}

export default Confetti
