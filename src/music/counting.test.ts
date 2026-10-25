import { describe, expect, it } from 'vitest'
import {
  buildBeats,
  describePosition,
  isCompound,
  kodalyForNote,
  labelForPosition,
  measureAt,
  pulseUnitQ,
} from './counting'
import type {
  MeasureInfo,
  ScoreAnalysis,
  TimeSignature,
  VisualStep,
} from './types'

const ts = (beats: number, beatType: number): TimeSignature => ({
  beats,
  beatType,
})

function measure(
  index: number,
  startQ: number,
  signature: TimeSignature,
): MeasureInfo {
  const compound = isCompound(signature)
  return {
    index,
    number: index + 1,
    startQ,
    durationQ: signature.beats * (4 / signature.beatType),
    timeSignature: signature,
    beatUnitQ: compound ? 1.5 : 4 / signature.beatType,
    compound,
    gridQ: pulseUnitQ(signature),
  }
}

function step(
  q: number,
  relQ: number,
  measureIndex: number,
  signature: TimeSignature,
): VisualStep {
  return {
    q,
    x: q * 10,
    y: 0,
    width: 4,
    height: 40,
    measureIndex,
    relQ,
    timeSignature: signature,
    label: labelForPosition(relQ, signature, 0.25),
    gridQ: 0.25,
    durationQ: 1,
    noteHeads: [],
    restHeads: [],
    hasNotes: true,
  }
}

function analysis(measures: MeasureInfo[], steps: VisualStep[]): ScoreAnalysis {
  return {
    steps,
    notes: [],
    measures,
    layout: [],
    staffLayouts: [],
    staffSteps: [],
    staffCount: 1,
    beats: buildBeats(measures),
    totalQ: 8,
    initialBpm: 100,
    title: 'Test',
  }
}

describe('meter helpers', () => {
  it('recognises compound meters', () => {
    expect(isCompound(ts(6, 8))).toBe(true)
    expect(isCompound(ts(9, 8))).toBe(true)
    expect(isCompound(ts(12, 8))).toBe(true)
    expect(isCompound(ts(3, 8))).toBe(false)
    expect(isCompound(ts(4, 4))).toBe(false)
  })

  it('derives the counting pulse for each meter', () => {
    expect(pulseUnitQ(ts(4, 4))).toBe(1)
    expect(pulseUnitQ(ts(2, 2))).toBe(2)
    expect(pulseUnitQ(ts(6, 8))).toBe(0.5)
    expect(pulseUnitQ(ts(3, 8))).toBe(0.5)
  })
})

describe('labelForPosition', () => {
  it('labels quarter and sixteenth subdivisions in simple time', () => {
    expect(labelForPosition(0, ts(4, 4), 0.25)).toEqual({
      beatNumber: 1,
      syllable: '',
      text: '1',
    })
    expect(labelForPosition(0.25, ts(4, 4), 0.25).text).toBe('1 e')
    expect(labelForPosition(0.5, ts(4, 4), 0.25).text).toBe('1 &')
    expect(labelForPosition(0.75, ts(4, 4), 0.25).text).toBe('1 a')
    expect(labelForPosition(1, ts(4, 4), 0.25).text).toBe('2')
    expect(labelForPosition(2.5, ts(4, 4), 0.25).text).toBe('3 &')
  })

  it('omits a subdivision label when the grid is a whole pulse', () => {
    expect(labelForPosition(0, ts(4, 4), 1).text).toBe('1')
    expect(labelForPosition(1.5, ts(4, 4), 1).text).toBe('2')
  })

  it('counts the eighth-note pulses in compound time', () => {
    expect(labelForPosition(0, ts(6, 8), 0.5).text).toBe('1')
    expect(labelForPosition(0.5, ts(6, 8), 0.5).text).toBe('2')
    expect(labelForPosition(1.5, ts(6, 8), 0.5).text).toBe('4')
    expect(labelForPosition(2.5, ts(6, 8), 0.5).text).toBe('6')
  })

  it('never exceeds the bar length', () => {
    expect(labelForPosition(99, ts(3, 4), 0.25).beatNumber).toBe(3)
  })
})

describe('buildBeats', () => {
  it('accentuates the first beat in simple time', () => {
    const beats = buildBeats([measure(0, 0, ts(4, 4))])
    expect(beats.map((beat) => beat.q)).toEqual([0, 1, 2, 3])
    expect(beats.map((beat) => beat.accent)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('accentuates every dotted-quarter pulse in 12/8', () => {
    const beats = buildBeats([measure(0, 0, ts(12, 8))])
    expect(beats).toHaveLength(12)
    expect(
      beats.filter((beat) => beat.accent).map((beat) => beat.q),
    ).toEqual([0, 1.5, 3, 4.5])
  })

  it('offsets beats by the measure start', () => {
    const beats = buildBeats([
      measure(0, 0, ts(4, 4)),
      measure(1, 4, ts(4, 4)),
    ])
    expect(beats[4].q).toBe(4)
    expect(beats[4].measureIndex).toBe(1)
  })
})

describe('describePosition', () => {
  const measures = [
    measure(0, 0, ts(4, 4)),
    measure(1, 4, ts(4, 4)),
  ]
  const steps = [
    step(0, 0, 0, ts(4, 4)),
    step(1.5, 1.5, 0, ts(4, 4)),
    step(4, 0, 1, ts(4, 4)),
  ]
  const score = analysis(measures, steps)

  it('finds the measure containing a position', () => {
    expect(measureAt(score, 0)?.index).toBe(0)
    expect(measureAt(score, 4.5)?.index).toBe(1)
    expect(measureAt(score, 99)?.index).toBe(1)
  })

  it('uses the note label at the current beat', () => {
    expect(describePosition(score, 0).countText).toBe('1')
    expect(describePosition(score, 1.5).countText).toBe('2 &')
  })

  it('falls back to the bare beat number between notes', () => {
    const position = describePosition(score, 2.5)
    expect(position.countText).toBe('3')
    expect(position.beatNumber).toBe(3)
    expect(position.beatLabels).toEqual(['1', '2', '3', '4'])
  })

  it('reports the second measure and its beat', () => {
    const position = describePosition(score, 5)
    expect(position.measureNumber).toBe(2)
    expect(position.measureIndex).toBe(1)
    expect(position.beatNumber).toBe(2)
  })

  it('returns a sane default for an empty analysis', () => {
    const empty = analysis([], [])
    expect(describePosition(empty, 0).countText).toBe('1')
  })
})

describe('kodalyForNote', () => {
  it('maps note values to syllables', () => {
    expect(kodalyForNote(4, 0, ts(4, 4))).toBe('ta-a-a-a')
    expect(kodalyForNote(3, 0, ts(4, 4))).toBe('ta-a-a')
    expect(kodalyForNote(2, 0, ts(4, 4))).toBe('ta-a')
    expect(kodalyForNote(1.5, 0, ts(4, 4))).toBe('ta-i')
    expect(kodalyForNote(1, 0, ts(4, 4))).toBe('ta')
    expect(kodalyForNote(0.75, 0, ts(4, 4))).toBe('tim')
    expect(kodalyForNote(0.5, 0, ts(4, 4))).toBe('ti')
  })

  it('alternates ti/ka for sixteenth pairs inside a beat', () => {
    expect(kodalyForNote(0.25, 0, ts(4, 4))).toBe('ti')
    expect(kodalyForNote(0.25, 0.25, ts(4, 4))).toBe('ka')
    expect(kodalyForNote(0.25, 0.5, ts(4, 4))).toBe('ti')
  })
})
