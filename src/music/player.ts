import type { AudioEngine } from './audio'
import type { Beat, NoteEvent, ScoreAnalysis } from './types'

export interface PlayerCallbacks {
  onPosition?: (q: number, playing: boolean) => void
  onStateChange?: (playing: boolean) => void
  onEnd?: () => void
}

function lowerBound<T extends { q: number }>(items: T[], q: number): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (items[mid].q < q) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

export class Player {
  private analysis: ScoreAnalysis | null = null
  private notes: NoteEvent[] = []
  private beats: Beat[] = []
  private bpm = 100
  private metronomeEnabled = true
  private loop = false
  private shuffleEnabled = false
  private shuffleAmount = 66
  private playing = false
  private pausedQ = 0
  private anchorQ = 0
  private anchorTime = 0
  private noteIndex = 0
  private beatIndex = 0
  private timerId: number | null = null
  private rafId: number | null = null
  private callbacks: PlayerCallbacks = {}
  private lastPosition = -1
  private engine: AudioEngine

  constructor(engine: AudioEngine) {
    this.engine = engine
  }

  setCallbacks(callbacks: PlayerCallbacks): void {
    this.callbacks = callbacks
  }

  load(analysis: ScoreAnalysis, bpm: number): void {
    this.stop()
    this.analysis = analysis
    this.notes = analysis.notes
    this.beats = analysis.beats
    this.bpm = bpm
    this.pausedQ = 0
    this.resetIndices(0)
    this.emitPosition(0)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get currentBpm(): number {
    return this.bpm
  }

  currentQ(): number {
    if (!this.analysis) {
      return 0
    }
    if (!this.playing) {
      return this.pausedQ
    }
    const elapsed = Math.max(
      0,
      this.engine.context.currentTime - this.anchorTime,
    )
    return Math.min(this.analysis.totalQ, this.anchorQ + elapsed * (this.bpm / 60))
  }

  play(): void {
    if (!this.analysis || this.playing) {
      return
    }
    const ctx = this.engine.ensure()
    if (this.pausedQ >= this.analysis.totalQ - 0.01) {
      this.pausedQ = 0
    }
    this.anchorQ = this.pausedQ
    this.anchorTime = ctx.currentTime + 0.08
    this.resetIndices(this.anchorQ)
    this.playing = true
    this.callbacks.onStateChange?.(true)
    this.startLoops()
    this.tick()
    this.emitPosition(this.anchorQ)
  }

  pause(): void {
    if (!this.playing) {
      return
    }
    this.pausedQ = this.currentQ()
    this.playing = false
    this.engine.stopAll()
    this.stopLoops()
    this.callbacks.onStateChange?.(false)
    this.emitPosition(this.pausedQ)
  }

  toggle(): void {
    if (this.playing) {
      this.pause()
    } else {
      this.play()
    }
  }

  stop(): void {
    this.playing = false
    this.engine.stopAll()
    this.stopLoops()
    this.pausedQ = 0
    this.resetIndices(0)
    this.callbacks.onStateChange?.(false)
    this.emitPosition(0)
  }

  seek(q: number): void {
    if (!this.analysis) {
      return
    }
    const target = Math.max(0, Math.min(this.analysis.totalQ, q))
    if (this.playing) {
      this.engine.stopAll()
      this.anchorQ = target
      this.anchorTime = this.engine.context.currentTime + 0.05
      this.resetIndices(target)
      this.tick()
    } else {
      this.pausedQ = target
    }
    this.emitPosition(target)
  }

  setBpm(bpm: number): void {
    const next = Math.max(30, Math.min(240, Math.round(bpm)))
    if (next === this.bpm) {
      return
    }
    if (this.playing) {
      const q = this.currentQ()
      this.anchorQ = q
      this.anchorTime = this.engine.context.currentTime
      this.pausedQ = q
      this.bpm = next
    } else {
      this.bpm = next
    }
  }

  setMetronome(enabled: boolean): void {
    if (this.metronomeEnabled === enabled) {
      return
    }
    this.metronomeEnabled = enabled
    if (enabled && this.playing) {
      this.beatIndex = lowerBound(this.beats, this.currentQ() - 0.0001)
    }
  }

  setLoop(loop: boolean): void {
    this.loop = loop
  }

  setShuffle(enabled: boolean, amount: number): void {
    this.shuffleEnabled = enabled
    this.shuffleAmount = Math.max(50, Math.min(75, amount))
  }

  private swungQ(q: number): number {
    if (!this.shuffleEnabled) {
      return q
    }
    const beatStart = Math.floor(q + 0.000001)
    const position = q - beatStart
    if (position < 0.5 - 0.000001) {
      return q
    }
    const ratio = this.shuffleAmount / 100
    const mapped = ratio + ((position - 0.5) / 0.5) * (1 - ratio)
    return beatStart + mapped
  }

  private resetIndices(q: number): void {
    this.noteIndex = lowerBound(this.notes, q - 0.0001)
    this.beatIndex = lowerBound(this.beats, q - 0.0001)
  }

  private startLoops(): void {
    this.stopLoops()
    this.timerId = window.setInterval(() => this.tick(), 25)
    const frame = () => {
      if (!this.playing) {
        return
      }
      this.emitPosition(this.currentQ())
      this.rafId = window.requestAnimationFrame(frame)
    }
    this.rafId = window.requestAnimationFrame(frame)
  }

  private stopLoops(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private tick(): void {
    if (!this.playing || !this.analysis) {
      return
    }
    const ctx = this.engine.context
    const bps = this.bpm / 60
    const nowQ = this.currentQ()
    const horizonQ = nowQ + Math.max(0.2, 0.35 * bps)
    const now = ctx.currentTime

    while (this.noteIndex < this.notes.length) {
      const note = this.notes[this.noteIndex]
      if (note.q > horizonQ) {
        break
      }
      if (note.q >= this.anchorQ - 0.0001 && !note.isRest) {
        const startQ = this.swungQ(note.q)
        const endQ = this.swungQ(note.q + note.durQ)
        const when = this.anchorTime + (startQ - this.anchorQ) / bps
        if (when >= now - 0.04) {
          this.engine.playNote(
            note.frequency,
            when,
            Math.max(0.03, (endQ - startQ) / bps),
            note.velocity,
          )
        }
      }
      this.noteIndex += 1
    }

    if (this.metronomeEnabled) {
      while (this.beatIndex < this.beats.length) {
        const beat = this.beats[this.beatIndex]
        if (beat.q > horizonQ) {
          break
        }
        if (beat.q >= this.anchorQ - 0.0001) {
          const when = this.anchorTime + (beat.q - this.anchorQ) / bps
          if (when >= now - 0.04) {
            this.engine.playClick(when, beat.accent)
          }
        }
        this.beatIndex += 1
      }
    }

    if (nowQ >= this.analysis.totalQ - 0.02) {
      if (this.loop) {
        this.engine.stopAll()
        this.pausedQ = 0
        this.anchorQ = 0
        this.anchorTime = ctx.currentTime + 0.08
        this.resetIndices(0)
      } else {
        this.playing = false
        this.pausedQ = this.analysis.totalQ
        this.engine.stopAll()
        this.stopLoops()
        this.callbacks.onStateChange?.(false)
        this.emitPosition(this.analysis.totalQ)
        this.callbacks.onEnd?.()
      }
    }
  }

  private emitPosition(q: number): void {
    const rounded = Math.round(q * 1000) / 1000
    if (rounded === this.lastPosition) {
      return
    }
    this.lastPosition = rounded
    this.callbacks.onPosition?.(q, this.playing)
  }

  dispose(): void {
    this.stop()
  }
}
