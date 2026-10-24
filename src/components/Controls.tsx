interface ControlsProps {
  playing: boolean
  bpm: number
  metronome: boolean
  loop: boolean
  follow: boolean
  shuffle: boolean
  shuffleAmount: number
  volume: number
  muted: boolean
  onToggle: () => void
  onRestart: () => void
  onBpm: (bpm: number) => void
  onMetronome: (enabled: boolean) => void
  onLoop: (enabled: boolean) => void
  onFollow: (enabled: boolean) => void
  onShuffle: (enabled: boolean) => void
  onShuffleAmount: (amount: number) => void
  onVolume: (volume: number) => void
  onMute: (muted: boolean) => void
}

function PlayIcon({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

export function Controls({
  playing,
  bpm,
  metronome,
  loop,
  follow,
  shuffle,
  shuffleAmount,
  volume,
  muted,
  onToggle,
  onRestart,
  onBpm,
  onMetronome,
  onLoop,
  onFollow,
  onShuffle,
  onShuffleAmount,
  onVolume,
  onMute,
}: ControlsProps) {
  return (
    <section className="panel practice-panel">
      <div className="panel-heading">
        <h2>Practice desk</h2>
        <span className="panel-tag">space to play</span>
      </div>

      <div className="transport">
        <button
          type="button"
          className={`play-button ${playing ? 'is-playing' : ''}`}
          onClick={onToggle}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <PlayIcon playing={playing} />
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onRestart}
          aria-label="Restart from the beginning"
          title="Restart"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5v5h5" />
            <path d="M5.6 10a7 7 0 1 1-1.1 6.5" />
          </svg>
        </button>
      </div>

      <div className="control-block">
        <div className="control-label-row">
          <label htmlFor="tempo">Tempo</label>
          <span className="control-value">{bpm} BPM</span>
        </div>
        <div className="tempo-row">
          <button
            type="button"
            className="step-button"
            onClick={() => onBpm(bpm - 5)}
            aria-label="Slow down by 5 BPM"
          >
            −
          </button>
          <input
            id="tempo"
            type="range"
            min={40}
            max={200}
            step={1}
            value={bpm}
            onChange={(event) => onBpm(Number(event.target.value))}
          />
          <button
            type="button"
            className="step-button"
            onClick={() => onBpm(bpm + 5)}
            aria-label="Speed up by 5 BPM"
          >
            +
          </button>
        </div>
        <div className="tempo-scale">
          <span>Slow</span>
          <span>Andante</span>
          <span>Fast</span>
        </div>
      </div>

      <div className="control-block">
        <div className="control-label-row">
          <label htmlFor="shuffle-amount">Shuffle feel</label>
          <span className="control-value">
            {shuffle ? `${shuffleAmount}% swing` : 'Straight'}
          </span>
        </div>
        <div className="feel-row">
          <button
            type="button"
            className="feel-toggle"
            aria-pressed={shuffle}
            onClick={() => onShuffle(!shuffle)}
          >
            {shuffle ? 'On' : 'Off'}
          </button>
          <input
            id="shuffle-amount"
            type="range"
            min={50}
            max={75}
            step={1}
            value={shuffleAmount}
            disabled={!shuffle}
            onChange={(event) => onShuffleAmount(Number(event.target.value))}
          />
        </div>
        <div className="tempo-scale feel-scale">
          <span>Straight</span>
          <span>Shuffle</span>
          <span>Hard</span>
        </div>
      </div>

      <div className="control-block">
        <div className="control-label-row">
          <label htmlFor="volume">Sound</label>
          <span className="control-value">{Math.round(volume * 100)}%</span>
        </div>
        <div className="volume-row">
          <button
            type="button"
            className="mute-button"
            aria-pressed={!muted}
            onClick={() => onMute(!muted)}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M17 9l5 6M22 9l-5 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
              </svg>
            )}
          </button>
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => onVolume(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="toggle-grid">
        <button
          type="button"
          className="toggle"
          aria-pressed={metronome}
          onClick={() => onMetronome(!metronome)}
        >
          <span className="toggle-led" />
          Metronome
        </button>
        <button
          type="button"
          className="toggle"
          aria-pressed={loop}
          onClick={() => onLoop(!loop)}
        >
          <span className="toggle-led" />
          Loop
        </button>
        <button
          type="button"
          className="toggle"
          aria-pressed={follow}
          onClick={() => onFollow(!follow)}
        >
          <span className="toggle-led" />
          Auto-scroll
        </button>
      </div>

      <p className="practice-tip">
        Start slow. Tap the counting syllables with the metronome, then let the
        tempo creep up.
      </p>
    </section>
  )
}
