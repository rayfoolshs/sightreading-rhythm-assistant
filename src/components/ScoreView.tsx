import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { analyzeScore } from '../music/analyze'
import { pulseUnitQ } from '../music/counting'
import type { ScoreAnalysis, VisualStep } from '../music/types'

export interface ScoreViewHandle {
  sync: (q: number, playing: boolean) => void
  scrollToTop: () => void
}

interface ScoreViewProps {
  xml: string
  follow: boolean
  onAnalysis: (analysis: ScoreAnalysis) => void
  onError: (message: string) => void
}

function firstTimeSignature(
  xml: string,
): { beats: number; beatType: number } | null {
  try {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const time = document.getElementsByTagName('time')[0]
    if (!time) {
      return null
    }
    const beats = Number(time.getElementsByTagName('beats')[0]?.textContent)
    const beatType = Number(
      time.getElementsByTagName('beat-type')[0]?.textContent,
    )
    if (!beats || !beatType) {
      return null
    }
    return { beats, beatType }
  } catch {
    return null
  }
}

function beamGroupsFor(beats: number, beatType: number): number[][] | null {
  if (!beats || !beatType) {
    return null
  }
  const compound = beatType === 8 && beats > 3 && beats % 3 === 0
  if (compound) {
    return Array.from({ length: beats / 3 }, () => [3, 8])
  }
  if (beatType === 8) {
    return beats <= 3 ? [[beats, 8]] : null
  }
  const unit: [number, number] =
    beatType === 2 ? [1, 2] : beatType === 16 ? [1, 16] : [1, 4]
  if (beatType !== 2 && beatType !== 4 && beatType !== 8 && beatType !== 16) {
    return null
  }
  return Array.from({ length: beats }, () => unit)
}

interface LabelItem {
  q: number
  x: number
  y: number
  text: string
  compact: boolean
  range: boolean
}

function buildLabels(analysis: ScoreAnalysis): LabelItem[] {
  const measures = new Map(
    analysis.measures.map((measure) => [measure.index, measure]),
  )
  const groups = new Map<string, VisualStep[]>()
  const seen = new Set<string>()

  for (const step of analysis.steps) {
    if (!step.hasNotes) {
      continue
    }
    const measure = measures.get(step.measureIndex)
    if (!measure) {
      continue
    }
    const dedupeKey = `${step.measureIndex}:${Math.round(step.q * 1000)}`
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)
    const unit = pulseUnitQ(measure.timeSignature)
    const beatIndex = Math.floor(step.relQ / unit + 0.0001)
    const key = `${measure.index}:${beatIndex}`
    const group = groups.get(key)
    if (group) {
      group.push(step)
    } else {
      groups.set(key, [step])
    }
  }

  const labels: LabelItem[] = []
  for (const steps of groups.values()) {
    steps.sort((a, b) => a.q - b.q)
    const first = steps[0]
    const measure = measures.get(first.measureIndex)
    if (!measure) {
      continue
    }
    const unit = pulseUnitQ(measure.timeSignature)
    const beatIndex = Math.floor(first.relQ / unit + 0.0001)
    const beatStartQ = measure.startQ + beatIndex * unit
    const hasBeatStartNote = steps.some(
      (step) => Math.abs(step.q - beatStartQ) < 0.0001,
    )
    let firstSubdivision = true

    for (const step of steps) {
      const label = step.label
      let text = label.text
      let compact = false
      let range = false
      if (label.syllable) {
        if (hasBeatStartNote || !firstSubdivision) {
          text = label.syllable
          compact = true
        } else {
          firstSubdivision = false
        }
      } else if (step.durationQ > 0) {
        const beats = step.durationQ / unit
        const rounded = Math.round(beats)
        if (rounded >= 2 && Math.abs(beats - rounded) < 0.01) {
          const end = Math.min(
            measure.timeSignature.beats,
            label.beatNumber + rounded - 1,
          )
          if (end > label.beatNumber) {
            const values: string[] = []
            for (let value = label.beatNumber; value <= end; value += 1) {
              values.push(String(value))
            }
            text = values.join(' ')
            compact = true
            range = true
          }
        }
      }
      labels.push({
        q: step.q,
        x: step.x,
        y: step.y + step.height + 32,
        text,
        compact,
        range,
      })
    }
  }
  labels.sort((a, b) => a.q - b.q)
  return labels
}

const ScoreViewInner = forwardRef<ScoreViewHandle, ScoreViewProps>(
  function ScoreView({ xml, follow, onAnalysis, onError }, ref) {
    const hostRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLDivElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const lineRef = useRef<HTMLDivElement>(null)
    const analysisRef = useRef<ScoreAnalysis | null>(null)
    const activeLabelRef = useRef<HTMLDivElement | null>(null)
    const [labels, setLabels] = useState<LabelItem[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
      let cancelled = false
      const host = hostRef.current
      if (!host) {
        return
      }
      setLoading(true)
      setLabels([])
      analysisRef.current = null
      host.replaceChildren()

      const timeSignature = firstTimeSignature(xml)
      const beamGroups = timeSignature
        ? beamGroupsFor(timeSignature.beats, timeSignature.beatType)
        : null

      const osmd = new OpenSheetMusicDisplay(host, {
        backend: 'svg',
        autoResize: false,
        drawTitle: true,
        drawSubtitle: true,
        drawComposer: false,
        drawCredits: false,
        drawPartNames: false,
        drawMeasureNumbers: true,
        drawMeasureNumbersOnlyAtSystemStart: true,
        autoBeam: true,
        autoBeamOptions: {
          beam_rests: false,
          beam_middle_rests_only: true,
          groups: (beamGroups ?? undefined) as [number[]] | undefined,
        },
        followCursor: false,
        pageFormat: 'Endless',
        renderSingleHorizontalStaffline: false,
      })
      osmd.Zoom = 0.86
      osmd.FollowCursor = false

      const load = async () => {
        try {
          await osmd.load(xml)
          if (cancelled) {
            return
          }
          osmd.render()
          if (cancelled) {
            return
          }
          const analysis = analyzeScore(osmd, host)
          if (cancelled) {
            return
          }
          analysisRef.current = analysis
          setLabels(buildLabels(analysis))
          setLoading(false)
          onAnalysis(analysis)
        } catch (error) {
          if (cancelled) {
            return
          }
          setLoading(false)
          const message =
            error instanceof Error ? error.message : 'Could not read this score.'
          onError(message)
        }
      }

      void load()

      return () => {
        cancelled = true
        try {
          osmd.clear()
        } catch {
          // Ignore cleanup issues from a half-initialized OSMD instance.
        }
        host.replaceChildren()
      }
    }, [xml, onAnalysis, onError])

    useImperativeHandle(ref, () => ({
      sync(q: number, _playing: boolean) {
        const analysis = analysisRef.current
        if (!analysis) {
          return
        }
        const steps = analysis.steps
        if (steps.length === 0) {
          return
        }

        let index = 0
        let low = 0
        let high = steps.length - 1
        while (low <= high) {
          const mid = (low + high) >> 1
          if (steps[mid].q <= q + 0.0001) {
            index = mid
            low = mid + 1
          } else {
            high = mid - 1
          }
        }

        const step = steps[index]
        const next = steps[index + 1]
        let x = step.x
        if (
          next &&
          Math.abs(next.y - step.y) < 1.5 &&
          next.q > step.q + 0.0001
        ) {
          const ratio = Math.max(
            0,
            Math.min(1, (q - step.q) / (next.q - step.q)),
          )
          x = step.x + (next.x - step.x) * ratio
        }

        const line = lineRef.current
        if (line) {
          line.style.left = `${x}px`
          line.style.top = `${step.y}px`
          line.style.height = `${Math.max(24, step.height)}px`
          line.style.opacity = '1'
        }

        const canvas = canvasRef.current
        if (canvas) {
          const labelEls = canvas.querySelectorAll<HTMLDivElement>('.note-count')
          let active: HTMLDivElement | null = null
          for (const element of labelEls) {
            const labelQ = Number(element.dataset.q)
            if (labelQ <= q + 0.0001) {
              active = element
            }
          }
          if (activeLabelRef.current !== active) {
            activeLabelRef.current?.classList.remove('is-active')
            active?.classList.add('is-active')
            activeLabelRef.current = active
          }
        }

        if (follow) {
          const viewport = viewportRef.current
          if (viewport) {
            const top = viewport.scrollTop
            const bottom = top + viewport.clientHeight
            const lineTop = step.y
            const lineBottom = step.y + step.height
            if (lineTop < top + 50 || lineBottom > bottom - 70) {
              const target = Math.max(
                0,
                lineTop - viewport.clientHeight * 0.35,
              )
              viewport.scrollTop = top + (target - top) * 0.18
            }
          }
        }
      },
      scrollToTop() {
        viewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      },
    }))

    return (
      <div className="score-shell">
        {loading && (
          <div className="score-loading">
            <span className="spinner" />
            Engraving the score…
          </div>
        )}
        <div className="score-viewport" ref={viewportRef}>
          <div className="score-canvas" ref={canvasRef}>
            <div className="osmd-host" ref={hostRef} />
            <div className="note-count-layer" aria-hidden="true">
              {labels.map((label) => (
                <div
                  key={`${label.q}-${label.x}`}
                  className={`note-count ${label.compact ? 'is-compact' : ''} ${label.range ? 'is-range' : ''}`}
                  data-q={label.q}
                  style={{ left: label.x, top: label.y }}
                >
                  {label.text}
                </div>
              ))}
            </div>
            <div className="playhead" ref={lineRef} aria-hidden="true">
              <span className="playhead-dot" />
            </div>
          </div>
        </div>
      </div>
    )
  },
)

export const ScoreView = memo(ScoreViewInner)
