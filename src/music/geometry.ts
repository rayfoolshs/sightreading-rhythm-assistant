import type { MeasureInfo, MeasureLayout } from './types'

export interface ResolvedInput {
  measureIndex: number
  startQ: number
  midi: number
  step: string
  x: number
  y: number
}

interface InputPoint {
  x: number
  y: number
}

/**
 * Map a point inside the score canvas to a snapped note position.
 *
 * Points are already relative to the canvas (the caller subtracts the
 * bounding rect), which keeps this pure and testable.
 */
export function resolveInputPosition(
  point: InputPoint,
  layouts: MeasureLayout[],
  measures: MeasureInfo[],
): ResolvedInput | null {
  const layout = layouts.find(
    (item) =>
      point.x >= item.x - 4 &&
      point.x <= item.x + item.width + 4 &&
      point.y >= item.staffTopY - 55 &&
      point.y <= item.staffBottomY + 55,
  )
  if (!layout) {
    return null
  }
  const measure = measures.find((item) => item.index === layout.measureIndex)
  if (!measure) {
    return null
  }
  const startX = Math.min(
    layout.contentStartX,
    layout.x + layout.width - 10,
  )
  const endX = layout.x + layout.width - 3
  const relative =
    endX > startX
      ? Math.max(0, Math.min(1, (point.x - startX) / (endX - startX)))
      : 0
  let startQ = Math.round((relative * measure.durationQ) / 0.25) * 0.25
  startQ = Math.max(0, Math.min(measure.durationQ - 0.25, startQ))
  const halfSpace = (layout.staffBottomY - layout.staffTopY) / 8
  if (halfSpace <= 0) {
    return null
  }
  const steps = Math.round((layout.staffBottomY - point.y) / halfSpace)
  const semitones = [0, 2, 4, 5, 7, 9, 11]
  const diatonic = 4 * 7 + 2 + steps
  const octave = Math.floor(diatonic / 7)
  const letter = ((diatonic % 7) + 7) % 7
  const midi = (octave + 1) * 12 + semitones[letter]
  if (midi < 24 || midi > 100) {
    return null
  }
  const snappedX =
    startX + (startQ / Math.max(0.25, measure.durationQ)) * (endX - startX)
  const snappedY = layout.staffBottomY - steps * halfSpace
  return {
    measureIndex: measure.index,
    startQ,
    midi,
    step: 'CDEFGAB'[letter],
    x: snappedX,
    y: snappedY,
  }
}

export interface InputCursorBox {
  x: number
  top: number
  height: number
}

export function inputCursorPosition(
  cursor: { measureIndex: number; startQ: number },
  layouts: MeasureLayout[],
  measures: MeasureInfo[],
): InputCursorBox | null {
  const layout = layouts.find(
    (item) => item.measureIndex === cursor.measureIndex,
  )
  const measure = measures.find((item) => item.index === cursor.measureIndex)
  if (!layout || !measure) {
    return null
  }
  const startX = Math.min(layout.contentStartX, layout.x + layout.width - 10)
  const endX = layout.x + layout.width - 3
  const x =
    startX +
    (cursor.startQ / Math.max(0.25, measure.durationQ)) * (endX - startX)
  return {
    x,
    top: layout.staffTopY,
    height: Math.max(24, layout.staffBottomY - layout.staffTopY),
  }
}
