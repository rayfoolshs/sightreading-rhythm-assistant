import { describe, expect, it } from 'vitest'
import { inputCursorPosition, resolveInputPosition } from './geometry'
import type { MeasureInfo, MeasureLayout } from './types'

const layout: MeasureLayout = {
  measureIndex: 0,
  x: 0,
  y: 0,
  width: 200,
  height: 40,
  staffTopY: 0,
  staffBottomY: 40,
  contentStartX: 20,
}

const measure: MeasureInfo = {
  index: 0,
  number: 1,
  startQ: 0,
  durationQ: 4,
  timeSignature: { beats: 4, beatType: 4 },
  beatUnitQ: 1,
  compound: false,
  gridQ: 0.25,
}

const layouts = [layout]
const measures = [measure]

describe('resolveInputPosition', () => {
  it('snaps a point to a beat and a staff position', () => {
    const resolved = resolveInputPosition({ x: 110, y: 20 }, layouts, measures)
    expect(resolved).not.toBeNull()
    expect(resolved?.measureIndex).toBe(0)
    expect(resolved?.startQ).toBe(2)
    expect(resolved?.step).toBe('B')
    expect(resolved?.midi).toBe(71)
  })

  it('clamps the beat to the bar', () => {
    const start = resolveInputPosition({ x: 0, y: 20 }, layouts, measures)
    const end = resolveInputPosition({ x: 199, y: 20 }, layouts, measures)
    expect(start?.startQ).toBe(0)
    expect(end?.startQ).toBe(3.75)
  })

  it('rejects points outside the staff', () => {
    expect(resolveInputPosition({ x: 110, y: -100 }, layouts, measures)).toBe(
      null,
    )
    expect(resolveInputPosition({ x: 5000, y: 20 }, layouts, measures)).toBe(
      null,
    )
  })

  it('rejects a measure that is not in the analysis', () => {
    const orphan = [{ ...layout, measureIndex: 9 }]
    expect(resolveInputPosition({ x: 110, y: 20 }, orphan, measures)).toBeNull()
  })

  it('rejects a zero-height staff', () => {
    const flat = [{ ...layout, staffTopY: 40, staffBottomY: 40 }]
    expect(resolveInputPosition({ x: 110, y: 40 }, flat, measures)).toBeNull()
  })
})

describe('inputCursorPosition', () => {
  it('positions the cursor at the requested beat', () => {
    const box = inputCursorPosition(
      { measureIndex: 0, startQ: 2 },
      layouts,
      measures,
    )
    expect(box).toEqual({
      x: 20 + (2 / 4) * (197 - 20),
      top: 0,
      height: 40,
    })
  })

  it('returns null when the measure is missing', () => {
    expect(
      inputCursorPosition({ measureIndex: 4, startQ: 0 }, layouts, measures),
    ).toBeNull()
  })
})
