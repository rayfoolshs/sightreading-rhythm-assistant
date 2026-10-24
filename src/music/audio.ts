export class AudioEngine {
  private ctx?: AudioContext
  private master?: GainNode
  private noteBus?: GainNode
  private metroBus?: GainNode
  private active = new Set<AudioScheduledSourceNode>()
  private volume = 0.75
  private metronomeVolume = 0.7
  private muted = false

  ensure(): AudioContext {
    if (!this.ctx) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      this.ctx = new Context()
      this.master = this.ctx.createGain()
      this.noteBus = this.ctx.createGain()
      this.metroBus = this.ctx.createGain()
      this.master.gain.value = 0.9
      this.noteBus.connect(this.master)
      this.metroBus.connect(this.master)
      this.master.connect(this.ctx.destination)
      this.applyVolumes()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  get context(): AudioContext {
    return this.ensure()
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume
    this.muted = muted
    this.applyVolumes()
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeVolume = volume
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.noteBus || !this.metroBus) {
      return
    }
    const now = this.ctx.currentTime
    this.noteBus.gain.setTargetAtTime(
      this.muted ? 0 : this.volume,
      now,
      0.02,
    )
    this.metroBus.gain.setTargetAtTime(
      this.muted ? 0 : this.metronomeVolume,
      now,
      0.02,
    )
  }

  playNote(
    frequency: number,
    when: number,
    duration: number,
    velocity: number,
  ): void {
    const ctx = this.ensure()
    if (!this.noteBus) {
      return
    }
    const start = Math.max(when, ctx.currentTime + 0.001)
    const hold = Math.max(duration, 0.12)
    const peak = Math.max(0.05, Math.min(1, velocity)) * 0.32

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.006)
    gain.gain.linearRampToValueAtTime(peak * 0.55, start + 0.09)
    gain.gain.setValueAtTime(peak * 0.55, start + hold)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + hold + 0.35)
    gain.connect(this.noteBus)

    const oscillators: OscillatorNode[] = []
    const fundamental = ctx.createOscillator()
    fundamental.type = 'triangle'
    fundamental.frequency.value = frequency
    fundamental.connect(gain)

    const upper = ctx.createOscillator()
    upper.type = 'sine'
    upper.frequency.value = frequency * 2
    const upperGain = ctx.createGain()
    upperGain.gain.value = 0.22
    upper.connect(upperGain)
    upperGain.connect(gain)

    const body = ctx.createOscillator()
    body.type = 'sine'
    body.frequency.value = frequency * 0.5
    const bodyGain = ctx.createGain()
    bodyGain.gain.value = 0.15
    body.connect(bodyGain)
    bodyGain.connect(gain)

    oscillators.push(fundamental, upper, body)
    const stopAt = start + hold + 0.4
    for (const oscillator of oscillators) {
      oscillator.start(start)
      oscillator.stop(stopAt)
      this.track(oscillator)
    }
  }

  playClick(when: number, accent: boolean): void {
    const ctx = this.ensure()
    if (!this.metroBus) {
      return
    }
    const start = Math.max(when, ctx.currentTime + 0.001)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1760 : 1175
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(accent ? 0.35 : 0.2, start + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055)
    osc.connect(gain)
    gain.connect(this.metroBus)
    osc.start(start)
    osc.stop(start + 0.07)
    this.track(osc)
  }

  private track(source: AudioScheduledSourceNode): void {
    this.active.add(source)
    source.addEventListener('ended', () => {
      this.active.delete(source)
    })
  }

  stopAll(): void {
    for (const source of this.active) {
      try {
        source.stop()
      } catch {
        // Already stopped.
      }
    }
    this.active.clear()
  }
}
