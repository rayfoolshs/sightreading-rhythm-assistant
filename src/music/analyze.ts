import type {
  GraphicalNote,
  OpenSheetMusicDisplay,
  SourceMeasure,
} from 'opensheetmusicdisplay'
import type {
  MeasureInfo,
  NoteEvent,
  NoteHead,
  ScoreAnalysis,
  StaffLayout,
  TimeSignature,
  VisualStep,
} from './types'
import { buildBeats, labelForPosition, pulseUnitQ } from './counting'

const QUARTER_EPSILON = 1e-4
const MAX_STEPS = 40000

function timeSignatureOf(measure: SourceMeasure): TimeSignature {
  const fraction = measure.ActiveTimeSignature
  if (!fraction || !fraction.Numerator || !fraction.Denominator) {
    return { beats: 4, beatType: 4 }
  }
  return { beats: fraction.Numerator, beatType: fraction.Denominator }
}

function buildMeasures(
  measures: SourceMeasure[],
): MeasureInfo[] {
  const result: MeasureInfo[] = []
  let startQ = 0
  measures.forEach((measure, index) => {
    const timeSignature = timeSignatureOf(measure)
    const compound =
      timeSignature.beatType === 8 &&
      timeSignature.beats > 3 &&
      timeSignature.beats % 3 === 0
    let durationQ = 0
    try {
      durationQ = measure.Duration.RealValue * 4
    } catch {
      durationQ = 0
    }
    if (!Number.isFinite(durationQ) || durationQ <= 0) {
      durationQ = timeSignature.beats * (4 / timeSignature.beatType)
    }
    result.push({
      index,
      number: measure.MeasureNumber,
      startQ,
      durationQ,
      timeSignature,
      beatUnitQ: compound ? 1.5 : 4 / timeSignature.beatType,
      compound,
      gridQ: pulseUnitQ(timeSignature),
    })
    startQ += durationQ
  })
  return result
}

function noteKey(note: GraphicalNote): string {
  const source = note.sourceNote
  return `${source.Pitch.getHalfTone()}|${source.Length.RealValue.toFixed(4)}`
}

export function analyzeScore(
  osmd: OpenSheetMusicDisplay,
  container: HTMLElement,
): ScoreAnalysis {
  const sourceMeasures = osmd.Sheet.SourceMeasures ?? []
  const measures = buildMeasures(sourceMeasures)

  const staffSlotMap = new WeakMap<object, number>()
  let staffCount = 1
  for (const measure of measures) {
    const graphicalMeasures =
      osmd.GraphicSheet.MeasureList[measure.index] ?? []
    staffCount = Math.max(staffCount, graphicalMeasures.length)
    graphicalMeasures.forEach((graphicalMeasure, slot) => {
      const staff = graphicalMeasure.ParentStaff
      if (staff) {
        staffSlotMap.set(staff, slot)
      }
    })
  }

  const containerRect = container.getBoundingClientRect()

  const stepsByQ = new Map<number, VisualStep>()
  const notesByQ = new Map<number, Map<string, NoteEvent>>()
  const gridTicks = new Map<number, number>()
  const beamIds = new WeakMap<object, number>()
  let nextBeamId = 1

  const addGridValue = (measureIndex: number, valueQ: number) => {
    if (!Number.isFinite(valueQ) || valueQ <= 0.0001) {
      return
    }
    const ticks = Math.round(valueQ * 48)
    if (ticks <= 0) {
      return
    }
    const previous = gridTicks.get(measureIndex) ?? 0
    let a = previous
    let b = ticks
    while (b !== 0) {
      const remainder = a % b
      a = b
      b = remainder
    }
    gridTicks.set(measureIndex, a)
  }

  let initialBpm = 0
  let lastQ = -Infinity

  const cursor = osmd.cursor
  cursor.SkipInvisibleNotes = false
  cursor.reset()
  cursor.show()

  let guard = 0
  while (!cursor.iterator.EndReached && guard < MAX_STEPS) {
    guard += 1
    const iterator = cursor.iterator
    const q = iterator.CurrentSourceTimestamp.RealValue * 4

    if (q < lastQ - QUARTER_EPSILON) {
      // Repeats and jumps are ignored: skip the repeated section and keep
      // collecting the notation that follows it.
      cursor.next()
      continue
    }
    lastQ = Math.max(lastQ, q)

    if (initialBpm <= 0) {
      initialBpm = Number(iterator.CurrentBpm) || 0
    }

    const graphicalNotes = cursor.GNotesUnderCursor()
    const cursorRect = cursor.cursorElement.getBoundingClientRect()
    const cursorX = cursorRect.left - containerRect.left
    const y = cursorRect.top - containerRect.top
    const width = cursorRect.width || 4
    const height = cursorRect.height || 40
    const noteCenters: number[] = []
    for (const graphicalNote of graphicalNotes) {
      if (graphicalNote.sourceNote.isRest()) {
        continue
      }
      const box = graphicalNote.PositionAndShape
      if (!box) {
        continue
      }
      noteCenters.push(
        (box.AbsolutePosition.x + box.Size.width / 2) * 10 * osmd.Zoom,
      )
    }
    const x =
      noteCenters.length > 0
        ? (Math.min(...noteCenters) + Math.max(...noteCenters)) / 2
        : cursorX + 10 * osmd.Zoom

    const qKey = Math.round(q / QUARTER_EPSILON)
    const existing = stepsByQ.get(qKey)
    const measureIndex = Math.min(
      iterator.CurrentMeasureIndex,
      Math.max(0, measures.length - 1),
    )
    const measure = measures[measureIndex]
    const relQ = measure ? q - measure.startQ : q
    const timeSignature = measure?.timeSignature ?? {
      beats: 4,
      beatType: 4,
    }
    const hasNotes = graphicalNotes.length > 0
    let beamGroup: number | undefined
    for (const graphicalNote of graphicalNotes) {
      const beam = graphicalNote.sourceNote.NoteBeam
      if (beam) {
        beamGroup = beamIds.get(beam)
        if (beamGroup === undefined) {
          beamGroup = nextBeamId
          nextBeamId += 1
          beamIds.set(beam, beamGroup)
        }
        break
      }
    }
    addGridValue(measureIndex, relQ)

    if (!existing) {
      stepsByQ.set(qKey, {
        q,
        x,
        y,
        width,
        height,
        measureIndex,
        relQ,
        timeSignature,
        label: labelForPosition(relQ, timeSignature),
        gridQ: pulseUnitQ(timeSignature),
        beamGroup,
        durationQ: 0,
        noteHeads: [],
        restHeads: [],
        hasNotes,
      })
    } else if (hasNotes) {
      existing.hasNotes = true
      if (existing.beamGroup === undefined) {
        existing.beamGroup = beamGroup
      }
    }

    let notesAtQ = notesByQ.get(qKey)
    if (!notesAtQ && hasNotes) {
      notesAtQ = new Map()
      notesByQ.set(qKey, notesAtQ)
    }
    if (notesAtQ) {
      for (const graphicalNote of graphicalNotes) {
        const source = graphicalNote.sourceNote
        if (!source.PrintObject) {
          continue
        }
        if (source.isRest()) {
          const step = stepsByQ.get(qKey)
          const box = graphicalNote.PositionAndShape
          if (step && box) {
            const restX =
              (box.AbsolutePosition.x + box.Size.width / 2) * 10 * osmd.Zoom
            const restY =
              (box.AbsolutePosition.y + box.Size.height / 2) * 10 * osmd.Zoom
            if (
              !step.restHeads.some(
                (head) =>
                  Math.abs(head.x - restX) < 1 &&
                  Math.abs(head.y - restY) < 1,
              )
            ) {
              step.restHeads.push({
                x: restX,
                y: restY,
                measureIndex,
                onsetQ: relQ,
              })
            }
          }
          continue
        }
        if (source.NoteTie && source.NoteTie.StartNote !== source) {
          continue
        }
        const durQ = source.Length.RealValue * 4
        if (!Number.isFinite(durQ) || durQ <= 0) {
          continue
        }
        const frequency = source.Pitch.Frequency
        if (!Number.isFinite(frequency) || frequency <= 0) {
          continue
        }
        addGridValue(measureIndex, relQ)
        addGridValue(measureIndex, durQ)
        const step = stepsByQ.get(qKey)
        if (step) {
          step.durationQ = Math.max(step.durationQ, durQ)
          const box = graphicalNote.PositionAndShape
          if (box) {
            const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
            const headX =
              (box.AbsolutePosition.x + box.Size.width / 2) * 10 * osmd.Zoom
            const headY =
              (box.AbsolutePosition.y + box.Size.height / 2) * 10 * osmd.Zoom
            const headKey = `${midi}:${Math.round(headX)}:${Math.round(headY)}`
            if (
              !step.noteHeads.some(
                (head) =>
                  `${head.midi}:${Math.round(head.x)}:${Math.round(head.y)}` ===
                  headKey,
              )
            ) {
              const sourceStaff = source.ParentStaffEntry?.ParentStaff
              const staffIndex = sourceStaff
                ? staffSlotMap.get(sourceStaff) ??
                  Math.max(0, (sourceStaff.Id ?? 1) - 1)
                : 0
              step.noteHeads.push({
                x: headX,
                y: headY,
                measureIndex,
                onsetQ: relQ,
                midi,
                staffIndex,
                durationQ: durQ,
              })
            }
          }
        }
        notesAtQ.set(noteKey(graphicalNote), {
          q,
          durQ,
          frequency,
          isRest: false,
          measureIndex,
          velocity: 0.75,
        })
      }
    }

    cursor.next()
  }

  cursor.hide()
  cursor.reset()

  for (const measure of measures) {
    const ticks = gridTicks.get(measure.index) ?? 0
    const rawGrid = ticks > 0 ? ticks / 48 : pulseUnitQ(measure.timeSignature)
    measure.gridQ = Math.max(
      0.125,
      Math.min(pulseUnitQ(measure.timeSignature), rawGrid),
    )
  }

  const steps = Array.from(stepsByQ.values()).sort((a, b) => a.q - b.q)
  for (const step of steps) {
    const measure = measures[step.measureIndex]
    if (measure) {
      step.gridQ = measure.gridQ
      step.label = labelForPosition(
        step.relQ,
        step.timeSignature,
        measure.gridQ,
      )
    }
  }
  const notes: NoteEvent[] = []
  for (const events of notesByQ.values()) {
    notes.push(...events.values())
  }
  notes.sort((a, b) => a.q - b.q)

  const layout = measures.map((measure) => {
    const graphicalMeasure = osmd.GraphicSheet.MeasureList[measure.index]?.[0]
    const box = graphicalMeasure?.PositionAndShape
    const lines = graphicalMeasure?.ParentStaffLine?.StaffLines ?? []
    const offsetY = (box?.AbsolutePosition.y ?? 0) * 10 * osmd.Zoom
    const offsetX = (box?.AbsolutePosition.x ?? 0) * 10 * osmd.Zoom
    const width = (box?.Size.width ?? 0) * 10 * osmd.Zoom
    const top = offsetY + (lines[0]?.Start.y ?? 0) * 10 * osmd.Zoom
    const bottom =
      offsetY +
      (lines[lines.length - 1]?.Start.y ?? (box?.Size.height ?? 0)) *
        10 *
        osmd.Zoom
    const measureSteps = steps.filter(
      (step) => step.measureIndex === measure.index,
    )
    const contentStartX =
      measureSteps.length > 0
        ? Math.min(...measureSteps.map((step) => step.x))
        : offsetX + width * 0.2
    return {
      measureIndex: measure.index,
      x: offsetX,
      y: offsetY,
      width,
      height: (box?.Size.height ?? 0) * 10 * osmd.Zoom,
      staffTopY: top,
      staffBottomY: bottom,
      contentStartX,
    }
  })

  const staffLayouts: StaffLayout[] = []
  for (const measure of measures) {
    const graphicalMeasures =
      osmd.GraphicSheet.MeasureList[measure.index] ?? []
    graphicalMeasures.forEach((graphicalMeasure, staffIndex) => {
      const box = graphicalMeasure?.PositionAndShape
      const lines = graphicalMeasure?.ParentStaffLine?.StaffLines ?? []
      const offsetY = (box?.AbsolutePosition.y ?? 0) * 10 * osmd.Zoom
      const offsetX = (box?.AbsolutePosition.x ?? 0) * 10 * osmd.Zoom
      const top = offsetY + (lines[0]?.Start.y ?? 0) * 10 * osmd.Zoom
      const bottom =
        offsetY +
        (lines[lines.length - 1]?.Start.y ?? (box?.Size.height ?? 0)) *
          10 *
          osmd.Zoom
      staffLayouts.push({
        staffIndex,
        measureIndex: measure.index,
        x: offsetX,
        y: offsetY,
        width: (box?.Size.width ?? 0) * 10 * osmd.Zoom,
        height: (box?.Size.height ?? 0) * 10 * osmd.Zoom,
        staffTopY: top,
        staffBottomY: bottom,
      })
    })
  }

  const staffLayoutByKey = new Map(
    staffLayouts.map((layout) => [
      `${layout.measureIndex}:${layout.staffIndex}`,
      layout,
    ]),
  )
  const staffSteps: VisualStep[] = []
  for (const step of steps) {
    const headsByStaff = new Map<number, NoteHead[]>()
    for (const head of step.noteHeads) {
      const heads = headsByStaff.get(head.staffIndex) ?? []
      heads.push(head)
      headsByStaff.set(head.staffIndex, heads)
    }
    for (const [staffIndex, heads] of headsByStaff) {
      const layout = staffLayoutByKey.get(
        `${step.measureIndex}:${staffIndex}`,
      )
      const minX = Math.min(...heads.map((head) => head.x))
      const maxX = Math.max(...heads.map((head) => head.x))
      staffSteps.push({
        ...step,
        staffIndex,
        x: (minX + maxX) / 2,
        y: layout?.staffTopY ?? step.y,
        height: layout
          ? layout.staffBottomY - layout.staffTopY
          : step.height,
        durationQ: Math.max(...heads.map((head) => head.durationQ)),
        noteHeads: heads,
      })
    }
  }
  staffSteps.sort((a, b) => a.q - b.q)

  const beats = buildBeats(measures)
  const measuresEnd = measures.reduce(
    (sum, measure) => Math.max(sum, measure.startQ + measure.durationQ),
    0,
  )
  const lastStep = steps[steps.length - 1]
  const totalQ = Math.max(
    measuresEnd,
    lastStep ? lastStep.q + 4 : 0,
    notes.length > 0 ? notes[notes.length - 1].q + 1 : 0,
    4,
  )

  return {
    steps,
    notes,
    measures,
    layout,
    staffLayouts,
    staffSteps,
    staffCount,
    beats,
    totalQ,
    initialBpm: initialBpm > 0 ? initialBpm : 100,
    title: osmd.Sheet.TitleString || 'Untitled piece',
  }
}
