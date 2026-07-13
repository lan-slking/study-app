// Circular "correct/total" indicator — small on Home's subject cards, larger
// on the Kviz results screen. Empty/gray until a score actually exists.
function ProgressRing({ correct, total, color, size = 44, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const hasScore = Number.isInteger(total) && total > 0
  const ratio = hasScore ? correct / total : 0
  const offset = circumference * (1 - ratio)

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="progress-ring-svg">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--border)" strokeWidth={strokeWidth} fill="none" />
        {hasScore && (
          <circle
            className="progress-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            fill="none"
          />
        )}
      </svg>
      <span
        className="progress-ring-label"
        style={{ color: hasScore ? color : 'var(--muted-foreground)', fontSize: size / 4.4 }}
      >
        {hasScore ? `${correct}/${total}` : '–'}
      </span>
    </div>
  )
}

export default ProgressRing
