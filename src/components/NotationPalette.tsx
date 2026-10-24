import type { EditableNote } from '../music/musicxmlEditor'

interface NotationPaletteProps {
  selectedNote: EditableNote | null
  inputEnabled: boolean
  pendingDuration: number
  pendingDotted: boolean
  pendingRest: boolean
  pendingAccidental: number
  meter: { beats: number; beatType: number }
  meterTarget: number
  onNoteDuration: (value: number) => void
  onRestDuration: (value: number) => void
  onDot: () => void
  onAccidental: (semitones: number) => void
  onNatural: () => void
  onOctave: (semitones: number) => void
  onMeter: (beats: number, beatType: number) => void
}

function NoteSymbol({ value }: { value: number }) {
  if (value >= 4) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse
          cx="11.5"
          cy="16.5"
          rx="5.6"
          ry="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          transform="rotate(-16 11.5 16.5)"
        />
      </svg>
    )
  }
  const filled = value <= 1
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse
        cx="10.5"
        cy="16.5"
        rx="5.2"
        ry="3.7"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        transform="rotate(-16 10.5 16.5)"
      />
      <path
        d="M15.2 16.5V3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {value === 0.5 && (
        <path
          d="M15.2 3.5c3.9 1.7 4.5 4.9 1.2 7.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      {value === 0.25 && (
        <>
          <path
            d="M15.2 3.5c3.9 1.7 4.5 4.9 1.2 7.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M15.2 7c3.4 1.5 3.9 4.2 1.1 6.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}

function RestSymbol({ value }: { value: number }) {
  if (value >= 4) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8.5h12" stroke="currentColor" strokeWidth="1.8" />
        <rect x="7" y="10" width="10" height="4.5" rx="1" fill="currentColor" />
      </svg>
    )
  }
  if (value === 2) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="9.5" width="10" height="4.5" rx="1" fill="currentColor" />
        <path d="M6 16h12" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (value === 1) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M10.4 4.2h3.2l-2.1 4.4 2.4 1.8-3.2 8.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  const two = value === 0.25
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.5 4.5l-3.8 8.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.2" r="1.6" fill="currentColor" />
      {two && <circle cx="10.8" cy="10.4" r="1.6" fill="currentColor" />}
    </svg>
  )
}

const NOTE_VALUES = [
  { value: 4, label: 'Whole note' },
  { value: 2, label: 'Half note' },
  { value: 1, label: 'Quarter note' },
  { value: 0.5, label: 'Eighth note' },
  { value: 0.25, label: 'Sixteenth note' },
]

const REST_VALUES = [
  { value: 4, label: 'Whole rest' },
  { value: 2, label: 'Half rest' },
  { value: 1, label: 'Quarter rest' },
  { value: 0.5, label: 'Eighth rest' },
  { value: 0.25, label: 'Sixteenth rest' },
]

const METERS = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 8],
  [9, 8],
  [12, 8],
  [2, 2],
  [3, 8],
]

export function NotationPalette({
  selectedNote,
  inputEnabled,
  pendingDuration,
  pendingDotted,
  pendingRest,
  pendingAccidental,
  meter,
  meterTarget,
  onNoteDuration,
  onRestDuration,
  onDot,
  onAccidental,
  onNatural,
  onOctave,
  onMeter,
}: NotationPaletteProps) {
  const disabled = !selectedNote && !inputEnabled
  const isRest = selectedNote?.isRest ?? false
  const alter =
    selectedNote && !selectedNote.isRest
      ? Number(
          Array.from(selectedNote.element.children).find(
            (child) => child.tagName === 'pitch',
          )?.getElementsByTagName('alter')[0]?.textContent ?? 0,
        )
      : null

  const noteActive = (value: number) => {
    if (selectedNote) {
      return !selectedNote.isRest && Math.abs(selectedNote.durationQ - value) < 0.001
    }
    return inputEnabled && !pendingRest && Math.abs(pendingDuration - value) < 0.001
  }

  const restActive = (value: number) => {
    if (selectedNote) {
      return selectedNote.isRest && Math.abs(selectedNote.durationQ - value) < 0.001
    }
    return inputEnabled && pendingRest && Math.abs(pendingDuration - value) < 0.001
  }

  const dottedActive = selectedNote
    ? selectedNote.dots > 0
    : inputEnabled && pendingDotted

  const meterOptions = METERS.some(
    ([beats, beatType]) => beats === meter.beats && beatType === meter.beatType,
  )
    ? METERS
    : [...METERS, [meter.beats, meter.beatType]]

  return (
    <div className="notation-palette" role="toolbar" aria-label="Notation palette">
      <section className="palette-section">
        <span className="palette-caption">Notes</span>
        <div className="palette-group">
          {NOTE_VALUES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`palette-button ${noteActive(item.value) ? 'is-active' : ''}`}
              onClick={() => onNoteDuration(item.value)}
              disabled={disabled}
              title={item.label}
              aria-label={item.label}
            >
              <NoteSymbol value={item.value} />
            </button>
          ))}
          <button
            type="button"
            className={`palette-button ${dottedActive ? 'is-active' : ''}`}
            onClick={onDot}
            disabled={disabled}
            title="Dotted note"
            aria-label="Dotted note"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.6" fill="currentColor" />
            </svg>
          </button>
        </div>
      </section>

      <section className="palette-section">
        <span className="palette-caption">Rests</span>
        <div className="palette-group">
          {REST_VALUES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`palette-button ${restActive(item.value) ? 'is-active' : ''}`}
              onClick={() => onRestDuration(item.value)}
              disabled={disabled}
              title={item.label}
              aria-label={item.label}
            >
              <RestSymbol value={item.value} />
            </button>
          ))}
        </div>
      </section>

      <section className="palette-section">
        <span className="palette-caption">Accidentals</span>
        <div className="palette-group" aria-label="Accidentals">
          <button
            type="button"
            className={`palette-button palette-accidental ${
              alter !== null
                ? alter <= -1
                  ? 'is-active'
                  : ''
                : pendingAccidental < 0 && inputEnabled
                  ? 'is-active'
                  : ''
            }`}
            onClick={() => onAccidental(-1)}
            disabled={disabled || isRest}
            title="Flat / lower by a semitone"
            aria-label="Flat / lower by a semitone"
          >
            ♭
          </button>
          <button
            type="button"
            className={`palette-button palette-accidental ${
              alter !== null
                ? alter === 0
                  ? 'is-active'
                  : ''
                : pendingAccidental === 0 && inputEnabled
                  ? 'is-active'
                  : ''
            }`}
            onClick={onNatural}
            disabled={disabled || isRest}
            title="Natural"
            aria-label="Natural"
          >
            ♮
          </button>
          <button
            type="button"
            className={`palette-button palette-accidental ${
              alter !== null
                ? alter >= 1
                  ? 'is-active'
                  : ''
                : pendingAccidental > 0 && inputEnabled
                  ? 'is-active'
                  : ''
            }`}
            onClick={() => onAccidental(1)}
            disabled={disabled || isRest}
            title="Sharp / raise by a semitone"
            aria-label="Sharp / raise by a semitone"
          >
            ♯
          </button>
        </div>
      </section>

      <section className="palette-section">
        <span className="palette-caption">Octave</span>
        <div className="palette-group" aria-label="Octave">
          <button
            type="button"
            className="palette-button palette-octave"
            onClick={() => onOctave(12)}
            disabled={!selectedNote || isRest}
            title="Octave up"
            aria-label="Octave up"
          >
            8↑
          </button>
          <button
            type="button"
            className="palette-button palette-octave"
            onClick={() => onOctave(-12)}
            disabled={!selectedNote || isRest}
            title="Octave down"
            aria-label="Octave down"
          >
            8↓
          </button>
        </div>
      </section>

      <section className="palette-section palette-meter-section">
        <span className="palette-caption">Meter</span>
        <div className="palette-meter-group">
          <select
            className="meter-select"
            value={`${meter.beats}/${meter.beatType}`}
            onChange={(event) => {
              const [beats, beatType] = event.target.value
                .split('/')
                .map(Number)
              onMeter(beats, beatType)
            }}
            aria-label="Time signature"
          >
            {meterOptions.map(([beats, beatType]) => (
              <option key={`${beats}/${beatType}`} value={`${beats}/${beatType}`}>
                {beats}/{beatType}
              </option>
            ))}
          </select>
          <span className="palette-meter-target">
            {inputEnabled ? 'whole staff' : `from bar ${meterTarget + 1}`}
          </span>
        </div>
      </section>
    </div>
  )
}
