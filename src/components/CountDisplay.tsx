import type { PositionDescription } from '../music/types'

interface CountDisplayProps {
  position: PositionDescription
  totalMeasures: number
  playing: boolean
  bpm: number
}

export function CountDisplay({
  position,
  totalMeasures,
  playing,
  bpm,
}: CountDisplayProps) {
  const [number, ...rest] = position.countText.split(' ')
  const syllable = rest.join(' ')
  const announcement = `Measure ${position.measureNumber} of ${totalMeasures}, beat ${position.beatInMeasure}`
  return (
    <section className={`count-card ${playing ? 'is-playing' : ''}`}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div className="count-main">
        <div className="count-eyebrow">
          {playing ? 'Count out loud' : 'Ready to count'}
        </div>
        <div className="count-value">
          <span className="count-number">{number}</span>
          <span className="count-syllable">{syllable || '\u00A0'}</span>
        </div>
        <div className="count-meta">
          Measure {position.measureNumber} of {totalMeasures}
          <span className="dot-separator" />
          {bpm} BPM
        </div>
      </div>
      <div className="beat-track">
        {position.beatLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={
              index + 1 === position.beatInMeasure ? 'beat is-current' : 'beat'
            }
          >
            {label}
          </span>
        ))}
      </div>
    </section>
  )
}
