import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Controls } from './components/Controls'
import { CountDisplay } from './components/CountDisplay'
import { LoadPanel } from './components/LoadPanel'
import { ScoreView, type ScoreViewHandle } from './components/ScoreView'
import { AudioEngine } from './music/audio'
import { describePosition } from './music/counting'
import { demoPieces } from './music/demo'
import { Player } from './music/player'
import type { ScoreAnalysis } from './music/types'

interface OmrResponse {
  musicxml: string
  title?: string
}

function musicXmlTitle(xml: string): string | null {
  try {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const element =
      document.querySelector('work-title') ??
      document.querySelector('movement-title')
    const title = element?.textContent?.trim()
    return title || null
  } catch {
    return null
  }
}

function App() {
  const [scoreXml, setScoreXml] = useState(demoPieces[0].xml)
  const [scoreName, setScoreName] = useState(demoPieces[0].name)
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null)
  const [q, setQ] = useState(0)
  const [bpm, setBpm] = useState(84)
  const [playing, setPlaying] = useState(false)
  const [metronome, setMetronome] = useState(true)
  const [loop, setLoop] = useState(false)
  const [follow, setFollow] = useState(true)
  const [shuffle, setShuffle] = useState(false)
  const [shuffleAmount, setShuffleAmount] = useState(66)
  const [volume, setVolume] = useState(0.75)
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  const engine = useMemo(() => new AudioEngine(), [])
  const player = useMemo(() => new Player(engine), [engine])
  const scoreRef = useRef<ScoreViewHandle>(null)
  const lastUiUpdate = useRef(0)

  const handlePosition = useCallback((position: number, isPlaying: boolean) => {
    scoreRef.current?.sync(position, isPlaying)
    const now = performance.now()
    if (!isPlaying || now - lastUiUpdate.current > 70) {
      lastUiUpdate.current = now
      setQ(position)
    }
  }, [])

  useEffect(() => {
    player.setCallbacks({
      onPosition: handlePosition,
      onStateChange: setPlaying,
      onEnd: () => setPlaying(false),
    })
  }, [player, handlePosition])

  useEffect(() => {
    engine.setVolume(volume, muted)
  }, [engine, volume, muted])

  useEffect(() => {
    player.setShuffle(shuffle, shuffleAmount)
  }, [player, shuffle, shuffleAmount])

  const handleAnalysis = useCallback(
    (next: ScoreAnalysis) => {
      setAnalysis(next)
      setBpm(next.initialBpm)
      setQ(0)
      player.load(next, next.initialBpm)
      scoreRef.current?.sync(0, false)
    },
    [player],
  )

  const handleScoreError = useCallback((message: string) => {
    setError(message)
  }, [])

  const loadScore = useCallback(
    (xml: string, name: string) => {
      player.stop()
      setPlaying(false)
      setAnalysis(null)
      setQ(0)
      setError(null)
      setScoreXml(xml)
      setScoreName(name)
      scoreRef.current?.scrollToTop()
    },
    [player],
  )

  const handleToggle = useCallback(() => {
    engine.ensure()
    player.toggle()
  }, [engine, player])

  const handleRestart = useCallback(() => {
    player.seek(0)
    setQ(0)
    scoreRef.current?.scrollToTop()
  }, [player])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        handleToggle()
      } else if (event.key === 'Home') {
        event.preventDefault()
        handleRestart()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        player.seek(Math.max(0, player.currentQ() - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        player.seek(player.currentQ() + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRestart, handleToggle, player])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      const lower = file.name.toLowerCase()
      let statusTimer: number | null = null
      try {
        if (lower.endsWith('.xml') || lower.endsWith('.musicxml')) {
          const xml = await file.text()
          const fallback = file.name.replace(/\.[^.]+$/, '')
          loadScore(xml, musicXmlTitle(xml) ?? fallback)
          return
        }
        if (lower.endsWith('.mxl')) {
          throw new Error(
            'Compressed .mxl files are not supported yet. Export as MusicXML (.musicxml) or upload a photo/PDF.',
          )
        }
        setBusy(true)
        setStatus('Uploading your sheet music…')
        statusTimer = window.setTimeout(() => {
          setStatus('Reading notation with Audiveris — this can take a minute.')
        }, 1200)
        const form = new FormData()
        form.append('file', file)
        const response = await fetch('/api/omr', {
          method: 'POST',
          body: form,
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string
          } | null
          throw new Error(
            payload?.detail ??
              `The OMR server returned an error (${response.status}).`,
          )
        }
        const data = (await response.json()) as OmrResponse
        if (!data.musicxml) {
          throw new Error('The OMR server did not return any sheet music.')
        }
        loadScore(data.musicxml, data.title || file.name.replace(/\.[^.]+$/, ''))
      } catch (err) {
        const message =
          err instanceof TypeError
            ? 'Could not reach the OMR server. Start it with "npm run server" (see README) and try again.'
            : err instanceof Error
              ? err.message
              : 'Something went wrong while loading this file.'
        setError(message)
      } finally {
        if (statusTimer !== null) {
          window.clearTimeout(statusTimer)
        }
        setBusy(false)
        setStatus('')
      }
    },
    [loadScore],
  )

  const handleDemo = useCallback(
    (id: string) => {
      const demo = demoPieces.find((piece) => piece.id === id)
      if (demo) {
        loadScore(demo.xml, demo.name)
      }
    },
    [loadScore],
  )

  const position = useMemo(
    () => (analysis ? describePosition(analysis, q) : null),
    [analysis, q],
  )

  const totalMeasures = analysis?.measures.length ?? 0

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span>♪</span>
          </div>
          <div>
            <h1>Sightreading Rhythm Assistant</h1>
            <p>Photograph it. Count it. Play it.</p>
          </div>
        </div>
        <div className="header-piece">
          <span className="header-piece-label">On the stand</span>
          <span className="header-piece-name">{scoreName}</span>
        </div>
      </header>

      <main className="workspace">
        <section className="score-column">
          <div className="score-card">
            <ScoreView
              ref={scoreRef}
              xml={scoreXml}
              follow={follow}
              onAnalysis={handleAnalysis}
              onError={handleScoreError}
            />
          </div>
          {position ? (
            <CountDisplay
              position={position}
              totalMeasures={totalMeasures}
              playing={playing}
              bpm={bpm}
            />
          ) : (
            <section className="count-card count-card-placeholder">
              <div className="count-eyebrow">Counting</div>
              <div className="count-value">
                <span className="count-number">–</span>
              </div>
              <div className="count-meta">Waiting for a piece…</div>
            </section>
          )}
        </section>

        <aside className="side-column">
          <LoadPanel
            busy={busy}
            status={status}
            error={error}
            activeName={scoreName}
            onFile={handleFile}
            onDemo={handleDemo}
            onClearError={() => setError(null)}
          />
          <Controls
            playing={playing}
            bpm={bpm}
            metronome={metronome}
            loop={loop}
            follow={follow}
            shuffle={shuffle}
            shuffleAmount={shuffleAmount}
            volume={volume}
            muted={muted}
            onToggle={handleToggle}
            onRestart={handleRestart}
            onBpm={(next) => {
              const clamped = Math.max(40, Math.min(200, next))
              setBpm(clamped)
              player.setBpm(clamped)
            }}
            onMetronome={(enabled) => {
              setMetronome(enabled)
              player.setMetronome(enabled)
            }}
            onLoop={(enabled) => {
              setLoop(enabled)
              player.setLoop(enabled)
            }}
            onFollow={setFollow}
            onShuffle={setShuffle}
            onShuffleAmount={setShuffleAmount}
            onVolume={setVolume}
            onMute={setMuted}
          />
        </aside>
      </main>

      <footer className="app-footer">
        <span>Photo OMR by Audiveris</span>
        <span>Notation by OpenSheetMusicDisplay</span>
        <span>Space = play · ← → = nudge · Home = restart</span>
      </footer>
    </div>
  )
}

export default App
