// Circular progress indicator — small on Home's subject cards (blended
// mastery, see mastery.js), larger on Kviz/Dopolnjevanje results screens
// (that session's correct/total). Empty/gray until a value actually exists.
//
// Two ways to drive it: pass `correct`/`total` for a plain fraction (Quiz,
// Dopolnjevanje), or an explicit `ratio` (0-1, or null for "no data yet")
// plus its own `label` when the caller already has a computed percentage
// rather than a literal fraction (Home's mastery ring).
function ProgressRing({ correct, total, ratio, label, title, color, size = 44, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const usingRatio = ratio !== undefined
  const hasValue = usingRatio ? ratio !== null : Number.isInteger(total) && total > 0
  const effectiveRatio = usingRatio ? ratio ?? 0 : hasValue ? correct / total : 0
  const displayLabel = usingRatio ? label ?? '–' : hasValue ? `${correct}/${total}` : '–'
  const offset = circumference * (1 - effectiveRatio)

  return (
    <div className="progress-ring" style={{ width: size, height: size }} title={title}>
      <svg width={size} height={size} className="progress-ring-svg">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--border)" strokeWidth={strokeWidth} fill="none" />
        {hasValue && (
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
        style={{ color: hasValue ? color : 'var(--muted-foreground)', fontSize: size / 4.4 }}
      >
        {displayLabel}
      </span>
    </div>
  )
}

export default ProgressRing
