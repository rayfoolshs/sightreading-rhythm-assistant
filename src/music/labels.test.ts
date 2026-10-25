import { describe, expect, it } from 'vitest'
import {
  buildKodalyLabels,
  buildLabels,
  buildLabelsForStyle,
  labelY,
} from './labels'
import { isCompound, labelForPosition, pulseUnitQ } from './counting'
import type {
  MeasureInfo,
  ScoreAnalysis,
  StaffLayout,
  TimeSignature,
  VisualStep,
} from './types'

const fourFour: TimeSignature = { beats: 4, beatType: 4 }

function measure(index: number, startQ: number): MeasureInfo {
  return {
    index,
    number: index + 1,
    startQ,
    durationQ: 4,
    timeSignature: fourFour,
    beatUnitQ: 1,
    compound: isCompound(fourFour),
    gridQ: pulseUnitQ(fourFour),
  }
}

function step(
  q: number,
  relQ: number,
  durationQ: number,
  options: { heads?: number; staffIndex?: number; hasNotes?: boolean } = {},
): VisualStep {
  const heads = options.heads ?? 1
  return {
    q,
    x: 100 + q * 40,
    y: 10,
    width: 4,
    height: 40,
    measureIndex: 0,
    relQ,
    timeSignature: fourFour,
    label: labelForPosition(relQ, fourFour, 0.25),
    gridQ: 0.25,
    durationQ,
    noteHeads: Array.from({ length: heads }, () => ({
      x: 100,
      y: 10,
      measureIndex: 0,
      onsetQ: relQ,
      midi: 60,
      staffIndex: options.staffIndex ?? 0,
      durationQ,
    })),
    restHeads: [],
    hasNotes: options.hasNotes ?? true,
    staffIndex: options.staffIndex ?? 0,
  }
}

function layout(staffIndex: number, top: number, bottom: number): StaffLayout {
  return {
    staffIndex,
    measureIndex: 0,
    x: 0,
    y: top,
    width: 200,
    height: bottom - top,
    staffTopY: top,
    staffBottomY: bottom,
  }
}

function analysis(
  steps: VisualStep[],
  layouts: StaffLayout[] = [],
): ScoreAnalysis {
  return {
    steps,
    notes: [],
    measures: [measure(0, 0)],
    layout: [],
    staffLayouts: layouts,
    staffSteps: steps,
    staffCount: layouts.length || 1,
    beats: [],
    totalQ: 4,
    initialBpm: 100,
    title: 'Test',
  }
}

describe('buildLabels', () => {
  it('keeps the beat number on the first note of the beat', () => {
    const labels = buildLabels(
      analysis([step(0, 0, 1), step(0.5, 0.5, 0.5)]),
    )
    expect(labels.map((label) => label.text)).toEqual(['1', '&'])
    expect(labels[0].compact).toBe(false)
    expect(labels[1].compact).toBe(true)
  })

  it('shows the full count for the first subdivision of a beat', () => {
    const labels = buildLabels(analysis([step(1.5, 1.5, 0.5)]))
    expect(labels[0].text).toBe('2 &')
    expect(labels[0].compact).toBe(false)
  })

  it('writes a range for notes that span several beats', () => {
    const labels = buildLabels(analysis([step(0, 0, 2)]))
    expect(labels[0].text).toBe('1 2')
    expect(labels[0].range).toBe(true)
    expect(labels[0].compact).toBe(true)
  })

  it('skips steps without note heads', () => {
    const labels = buildLabels(
      analysis([step(0, 0, 1, { heads: 0 }), step(1, 1, 1)]),
    )
    expect(labels).toHaveLength(1)
    expect(labels[0].text).toBe('2')
  })

  it('groups counts per staff', () => {
    const labels = buildLabels(
      analysis([
        step(0, 0, 1, { staffIndex: 0 }),
        step(0, 0, 1, { staffIndex: 1 }),
      ]),
    )
    expect(labels.map((label) => label.staffIndex)).toEqual([0, 1])
  })
})

describe('buildKodalyLabels', () => {
  it('uses the Kodály syllable for each note value', () => {
    const labels = buildKodalyLabels(
      analysis([step(0, 0, 1), step(1, 1, 0.5)]),
    )
    expect(labels.map((label) => label.text)).toEqual(['ta', 'ti'])
  })
})

describe('buildLabelsForStyle', () => {
  it('switches between numbers and syllables', () => {
    const score = analysis([step(0, 0, 1)])
    expect(buildLabelsForStyle(score, 'numbers')[0].text).toBe('1')
    expect(buildLabelsForStyle(score, 'kodaly')[0].text).toBe('ta')
  })
})

describe('labelY', () => {
  it('falls back below the step when no staff layout exists', () => {
    const target = step(0, 0, 1)
    expect(labelY(analysis([target]), target)).toBe(target.y + 40 + 32)
  })

  it('tucks the label into the gap before the next staff', () => {
    const target = step(0, 0, 1)
    const score = analysis([target], [
      layout(0, 0, 40),
      layout(1, 80, 120),
    ])
    const y = labelY(score, target)
    expect(y).toBeGreaterThanOrEqual(40 + 8)
    expect(y).toBeLessThanOrEqual(40 + 32)
  })
})
