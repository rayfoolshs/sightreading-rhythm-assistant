import type {
  Beat,
  CountLabel,
  MeasureInfo,
  PositionDescription,
  ScoreAnalysis,
  TimeSignature,
} from './types'

const EPSILON = 1e-4

export function isCompound(ts: TimeSignature): boolean {
  return ts.beatType === 8 && ts.beats > 3 && ts.beats % 3 === 0
}

export function pulseUnitQ(ts: TimeSignature): number {
  return isCompound(ts) ? 0.5 : 4 / ts.beatType
}

function syllableForPosition(position: number): string {
  const options: Array<[number, string]> = [
    [0, ''],
    [0.25, 'e'],
    [0.5, '&'],
    [0.75, 'a'],
  ]
  let best = options[0]
  let bestDistance = Infinity
  for (const option of options) {
    const distance = Math.abs(position - option[0])
    if (distance < bestDistance) {
      best = option
      bestDistance = distance
    }
  }
  if (bestDistance > 0.06) {
    return '·'
  }
  return best[1]
}

export function labelForPosition(
  relQ: number,
  ts: TimeSignature,
  gridQ: number = pulseUnitQ(ts),
): CountLabel {
  const unit = pulseUnitQ(ts)
  const grid = Math.max(1 / 48, Math.min(unit, gridQ))
  const safeRel = Math.max(0, relQ)
  const rawBeat = Math.floor(safeRel / unit + EPSILON)
  const beatNumber = Math.min(ts.beats, rawBeat + 1)
  const offset = safeRel - rawBeat * unit
  const subIndex = Math.floor(offset / grid + EPSILON)
  const position = (subIndex * grid) / unit
  const syllable =
    Math.round(unit / grid) <= 1 ? '' : syllableForPosition(position)
  return {
    beatNumber,
    syllable,
    text: syllable ? `${beatNumber} ${syllable}` : `${beatNumber}`,
  }
}

export function buildBeats(measures: MeasureInfo[]): Beat[] {
  const beats: Beat[] = []
  for (const measure of measures) {
    const unit = pulseUnitQ(measure.timeSignature)
    for (let index = 0; index < measure.timeSignature.beats; index += 1) {
      beats.push({
        q: measure.startQ + index * unit,
        label: `${index + 1}`,
        accent: measure.compound ? index % 3 === 0 : index === 0,
        measureIndex: measure.index,
      })
    }
  }
  return beats
}

export function describePosition(
  analysis: ScoreAnalysis,
  q: number,
): PositionDescription {
  const measure = measureAt(analysis, q)
  if (!measure) {
    return {
      measureNumber: 1,
      measureIndex: 0,
      countText: '1',
      beatNumber: 1,
      beatInMeasure: 1,
      beatsInMeasure: 4,
      beatLabels: ['1', '2', '3', '4'],
    }
  }
  const relQ = Math.max(0, q - measure.startQ)
  const ts = measure.timeSignature
  const unit = pulseUnitQ(ts)
  const beatInMeasure = Math.min(
    ts.beats,
    Math.floor(relQ / unit + EPSILON) + 1,
  )
  const step = lastStepAtOrBefore(analysis, q)
  const countText =
    step &&
    step.measureIndex === measure.index &&
    step.label.beatNumber === beatInMeasure
      ? step.label.text
      : String(beatInMeasure)
  const beatLabels = Array.from({ length: ts.beats }, (_, index) =>
    String(index + 1),
  )
  return {
    measureNumber: measure.number,
    measureIndex: measure.index,
    countText,
    beatNumber: beatInMeasure,
    beatInMeasure,
    beatsInMeasure: ts.beats,
    beatLabels,
  }
}

function lastStepAtOrBefore(
  analysis: ScoreAnalysis,
  q: number,
): ScoreAnalysis['steps'][number] | null {
  const steps = analysis.steps
  let low = 0
  let high = steps.length - 1
  let found: ScoreAnalysis['steps'][number] | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    if (steps[mid].q <= q + EPSILON) {
      found = steps[mid]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

export function measureAt(
  analysis: ScoreAnalysis,
  q: number,
): MeasureInfo | undefined {
  let found: MeasureInfo | undefined
  for (const measure of analysis.measures) {
    if (measure.startQ <= q + EPSILON) {
      found = measure
    } else {
      break
    }
  }
  return found ?? analysis.measures[0]
}
