import { kodalyForNote, pulseUnitQ } from './counting'
import type { ScoreAnalysis, VisualStep } from './types'

export interface LabelItem {
  q: number
  x: number
  y: number
  text: string
  compact: boolean
  range: boolean
  staffIndex: number
}

/** Place the counting row just below the staff, in the gap before the next one. */
export function labelY(analysis: ScoreAnalysis, step: VisualStep): number {
  const staffIndex = step.staffIndex ?? 0
  const current = analysis.staffLayouts.find(
    (layout) =>
      layout.measureIndex === step.measureIndex &&
      layout.staffIndex === staffIndex,
  )
  if (!current) {
    return step.y + step.height + 32
  }
  const next = analysis.staffLayouts.find(
    (layout) =>
      layout.measureIndex === step.measureIndex &&
      layout.staffIndex === staffIndex + 1,
  )
  let offset = 32
  if (next && next.staffTopY > current.staffBottomY) {
    const gap = next.staffTopY - current.staffBottomY
    offset = Math.max(8, Math.min(32, gap - 26))
  }
  return current.staffBottomY + offset
}

function labelSteps(analysis: ScoreAnalysis): VisualStep[] {
  return analysis.staffSteps.length > 0
    ? analysis.staffSteps
    : analysis.steps
}

export function buildKodalyLabels(analysis: ScoreAnalysis): LabelItem[] {
  const labels: LabelItem[] = []
  const seen = new Set<string>()
  for (const step of labelSteps(analysis)) {
    if (!step.hasNotes || step.noteHeads.length === 0) {
      continue
    }
    const staffIndex = step.staffIndex ?? 0
    const key = `${staffIndex}:${step.measureIndex}:${Math.round(step.q * 1000)}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    labels.push({
      q: step.q,
      x: step.x,
      y: labelY(analysis, step),
      text: kodalyForNote(step.durationQ, step.relQ, step.timeSignature),
      compact: false,
      range: false,
      staffIndex,
    })
  }
  labels.sort((a, b) => a.q - b.q)
  return labels
}

export function buildLabels(analysis: ScoreAnalysis): LabelItem[] {
  const measures = new Map(
    analysis.measures.map((measure) => [measure.index, measure]),
  )
  const groups = new Map<string, VisualStep[]>()
  const seen = new Set<string>()

  for (const step of labelSteps(analysis)) {
    if (!step.hasNotes || step.noteHeads.length === 0) {
      continue
    }
    const measure = measures.get(step.measureIndex)
    if (!measure) {
      continue
    }
    const staffIndex = step.staffIndex ?? 0
    const dedupeKey = `${staffIndex}:${step.measureIndex}:${Math.round(step.q * 1000)}`
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)
    const unit = pulseUnitQ(measure.timeSignature)
    const beatIndex = Math.floor(step.relQ / unit + 0.0001)
    const key = `${staffIndex}:${measure.index}:${beatIndex}`
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
        y: labelY(analysis, step),
        text,
        compact,
        range,
        staffIndex: step.staffIndex ?? 0,
      })
    }
  }
  labels.sort((a, b) => a.q - b.q)
  return labels
}

export function buildLabelsForStyle(
  analysis: ScoreAnalysis,
  style: 'numbers' | 'kodaly',
): LabelItem[] {
  return style === 'kodaly'
    ? buildKodalyLabels(analysis)
    : buildLabels(analysis)
}
