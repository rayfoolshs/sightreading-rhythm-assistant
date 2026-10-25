import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { analyzeScore } from '../music/analyze'
import { inputCursorPosition, resolveInputPosition } from '../music/geometry'
import { buildLabelsForStyle, type LabelItem } from '../music/labels'
import type {
  MeasureLayout,
  NoteHead,
  NoteSelection,
  RestHead,
  ScoreAnalysis,
} from '../music/types'

export interface ScoreViewHandle {
  sync: (q: number, playing: boolean) => void
  scrollToTop: () => void
  focusSelection: (selection: NoteSelection) => void
}

interface ScoreViewProps {
  xml: string
  follow: boolean
  countingStyle: 'numbers' | 'kodaly'
  visibleStaffs: Record<number, boolean>
  editMode: boolean
  inputEnabled: boolean
  inputRest: boolean
  selections: NoteSelection[]
  inputCursor: { measureIndex: number; startQ: number } | null
  onSelectNote: (selection: NoteSelection, extend: boolean) => void
  onInputNote: (input: {
    measureIndex: number
    startQ: number
    midi: number
    step?: string
  }) => void
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

function scrollBehavior(): ScrollBehavior {
  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduced ? 'auto' : 'smooth'
}

function beamGroupsFor(beats: number, beatType: number): number[][] | null {  if (!beats || !beatType) {
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

const ScoreViewInner = forwardRef<ScoreViewHandle, ScoreViewProps>(
  function ScoreView(
    {
      xml,
      follow,
      countingStyle,
      visibleStaffs,
      editMode,
      inputEnabled,
      inputRest,
      selections,
      inputCursor,
      onSelectNote,
      onInputNote,
      onAnalysis,
      onError,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLDivElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const lineRef = useRef<HTMLDivElement>(null)
    const analysisRef = useRef<ScoreAnalysis | null>(null)
    const layoutRef = useRef<MeasureLayout[]>([])
    const styleRef = useRef(countingStyle)
    const activeLabelsRef = useRef<Set<HTMLDivElement>>(new Set())
    const [labels, setLabels] = useState<LabelItem[]>([])
    const [noteHeads, setNoteHeads] = useState<NoteHead[]>([])
    const [restHeads, setRestHeads] = useState<RestHead[]>([])
    const [renderAnalysis, setRenderAnalysis] = useState<ScoreAnalysis | null>(
      null,
    )
    const [renderLayouts, setRenderLayouts] = useState<MeasureLayout[]>([])
    const [inputGhost, setInputGhost] = useState<{
      x: number
      y: number
    } | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
      styleRef.current = countingStyle
    }, [countingStyle])

    useEffect(() => {
      let cancelled = false
      const host = hostRef.current
      if (!host) {
        return
      }
      setLoading(true)
      setLabels([])
      setNoteHeads([])
      setRestHeads([])
      setRenderAnalysis(null)
      setRenderLayouts([])
      layoutRef.current = []
      analysisRef.current = null
      host.replaceChildren()

      const timeSignature = firstTimeSignature(xml)
      const beamGroups = timeSignature
        ? beamGroupsFor(timeSignature.beats, timeSignature.beatType)
        : null

      let osmd: OpenSheetMusicDisplay | null = null

      const load = async () => {
        try {
          const { OpenSheetMusicDisplay: Engraver } = await import(
            'opensheetmusicdisplay'
          )
          if (cancelled) {
            return
          }
          const engraver = new Engraver(host, {
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
          osmd = engraver
          engraver.Zoom = 0.86
          engraver.FollowCursor = false
          await engraver.load(xml)
          if (cancelled) {
            return
          }
          engraver.render()
          if (cancelled) {
            return
          }
          const analysis = analyzeScore(engraver, host)
          if (cancelled) {
            return
          }
          analysisRef.current = analysis
          setLabels(buildLabelsForStyle(analysis, styleRef.current))
          layoutRef.current = analysis.layout
          setRenderAnalysis(analysis)
          setRenderLayouts(analysis.layout)
          setNoteHeads(analysis.steps.flatMap((step) => step.noteHeads))
          setRestHeads(analysis.steps.flatMap((step) => step.restHeads))
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
          osmd?.clear()
        } catch {
          // Ignore cleanup issues from a half-initialized OSMD instance.
        }
        host.replaceChildren()
      }
    }, [xml, onAnalysis, onError])

    const resolveInputAt = (clientX: number, clientY: number) => {
      if (!inputEnabled) {
        return null
      }
      const canvas = canvasRef.current
      const analysis = analysisRef.current
      if (!canvas || !analysis) {
        return null
      }
      const rect = canvas.getBoundingClientRect()
      return resolveInputPosition(
        { x: clientX - rect.left, y: clientY - rect.top },
        layoutRef.current,
        analysis.measures,
      )
    }

    const handleInputClick = (event: React.MouseEvent<HTMLDivElement>) => {
      const resolved = resolveInputAt(event.clientX, event.clientY)
      if (!resolved) {
        return
      }
      onInputNote({
        measureIndex: resolved.measureIndex,
        startQ: resolved.startQ,
        midi: resolved.midi,
        step: resolved.step,
      })
    }

    const handleInputMove = (event: React.MouseEvent<HTMLDivElement>) => {
      if (!inputEnabled) {
        setInputGhost(null)
        return
      }
      const resolved = resolveInputAt(event.clientX, event.clientY)
      if (!resolved) {
        setInputGhost(null)
        return
      }
      setInputGhost((previous) => {
        if (
          previous &&
          Math.abs(previous.x - resolved.x) < 0.5 &&
          Math.abs(previous.y - resolved.y) < 0.5
        ) {
          return previous
        }
        return { x: resolved.x, y: resolved.y }
      })
    }

    useEffect(() => {
      const analysis = analysisRef.current
      if (!analysis) {
        return
      }
      setLabels(buildLabelsForStyle(analysis, countingStyle))
    }, [countingStyle])

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
          const lastByStaff = new Map<string, HTMLDivElement>()
          const labelEls = canvas.querySelectorAll<HTMLDivElement>('.note-count')
          for (const element of labelEls) {
            const labelQ = Number(element.dataset.q)
            if (labelQ > q + 0.0001) {
              continue
            }
            const staff = element.dataset.staff ?? '0'
            const previous = lastByStaff.get(staff)
            if (!previous || Number(previous.dataset.q) <= labelQ) {
              lastByStaff.set(staff, element)
            }
          }
          const active = new Set(lastByStaff.values())
          for (const element of activeLabelsRef.current) {
            if (!active.has(element)) {
              element.classList.remove('is-active')
            }
          }
          for (const element of active) {
            element.classList.add('is-active')
          }
          activeLabelsRef.current = active
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
        viewportRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })
      },
      focusSelection(target: NoteSelection) {
        const viewport = viewportRef.current
        if (!viewport) {
          return
        }
        const head =
          target.midi === null
            ? restHeads.find(
                (item) =>
                  item.measureIndex === target.measureIndex &&
                  Math.abs(item.onsetQ - target.onsetQ) < 0.02,
              )
            : noteHeads.find(
                (item) =>
                  item.measureIndex === target.measureIndex &&
                  Math.abs(item.onsetQ - target.onsetQ) < 0.02 &&
                  item.midi === target.midi,
              )
        if (!head) {
          return
        }
        viewport.scrollTo({
          top: Math.max(0, head.y - viewport.clientHeight * 0.4),
          behavior: scrollBehavior(),
        })
      },
    }))

    const cursorPosition = useMemo(() => {
      if (!inputEnabled || !inputCursor || !renderAnalysis) {
        return null
      }
      return inputCursorPosition(
        inputCursor,
        renderLayouts,
        renderAnalysis.measures,
      )
    }, [inputCursor, inputEnabled, renderAnalysis, renderLayouts])

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
            {inputEnabled && (
              <div
                className="score-input-layer"
                onClick={handleInputClick}
                onMouseMove={handleInputMove}
                onMouseLeave={() => setInputGhost(null)}
                aria-hidden="true"
              >
                {inputGhost && (
                  <div
                    className="input-ghost"
                    style={{ left: inputGhost.x, top: inputGhost.y }}
                  >
                    {inputRest ? (
                      <span className="ghost-rest" />
                    ) : (
                      <>
                        <span className="ghost-note" />
                        <span className="ghost-stem" />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {cursorPosition && (
              <div
                className="input-cursor"
                style={{
                  left: cursorPosition.x,
                  top: cursorPosition.top,
                  height: cursorPosition.height,
                }}
                aria-hidden="true"
              />
            )}
            {editMode && (
              <div className="note-hit-layer">
                {noteHeads.map((head) => {
                  const selected = selections.some(
                    (item) =>
                      item.midi !== null &&
                      item.measureIndex === head.measureIndex &&
                      Math.abs(item.onsetQ - head.onsetQ) < 0.02 &&
                      item.midi === head.midi,
                  )
                  return (
                    <button
                      key={`${head.measureIndex}-${head.onsetQ}-${head.midi}-${head.x}`}
                      type="button"
                      className={`note-hit ${selected ? 'is-selected' : ''}`}
                      style={{ left: head.x, top: head.y }}
                      tabIndex={-1}
                      onClick={(event) =>
                        onSelectNote(
                          {
                            measureIndex: head.measureIndex,
                            onsetQ: head.onsetQ,
                            midi: head.midi,
                          },
                          event.shiftKey,
                        )
                      }
                      aria-label={`Edit note at measure ${head.measureIndex + 1}`}
                    />
                  )
                })}
                {!inputEnabled &&
                  restHeads.map((head) => {
                    const selected = selections.some(
                      (item) =>
                        item.midi === null &&
                        item.measureIndex === head.measureIndex &&
                        Math.abs(item.onsetQ - head.onsetQ) < 0.02,
                    )
                    return (
                      <button
                        key={`rest-${head.measureIndex}-${head.onsetQ}-${head.x}`}
                        type="button"
                        className={`note-hit is-rest ${
                          selected ? 'is-selected' : ''
                        }`}
                        style={{ left: head.x, top: head.y }}
                        tabIndex={-1}
                        onClick={() =>
                          onSelectNote(
                            {
                              measureIndex: head.measureIndex,
                              onsetQ: head.onsetQ,
                              midi: null,
                            },
                            false,
                          )
                        }
                        aria-label={`Edit rest at measure ${head.measureIndex + 1}`}
                      />
                    )
                  })}
              </div>
            )}
            <div className="note-count-layer" aria-hidden="true">
              {labels
                .filter(
                  (label) => visibleStaffs[label.staffIndex] !== false,
                )
                .map((label) => (
                  <div
                    key={`${label.staffIndex}-${label.q}-${label.x}`}
                    className={`note-count ${label.compact ? 'is-compact' : ''} ${label.range ? 'is-range' : ''}`}
                    data-q={label.q}
                    data-staff={label.staffIndex}
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
