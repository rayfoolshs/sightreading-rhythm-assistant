import { describe, expect, it } from 'vitest'
import {
  BLANK_MEASURE_COUNT,
  changeBlankMeter,
  createBlankMusicXml,
  insertBlankNote,
  meterFromXml,
  moveBlankNote,
  normalizeBlankXml,
  notesFromBlankXml,
} from './blankScore'
import { parseEditableNotes } from './musicxmlEditor'

const blank = createBlankMusicXml()

describe('createBlankMusicXml', () => {
  it('creates an empty eight-bar treble staff', () => {
    expect(blank.match(/<measure /g)).toHaveLength(BLANK_MEASURE_COUNT)
    expect(blank).toContain('<divisions>8</divisions>')
    expect(blank).toContain('<sign>G</sign>')
    expect(blank).toContain('<beats>4</beats>')
    expect(notesFromBlankXml(blank)).toEqual([])
  })

  it('hides its voice-two anchors from the note parser', () => {
    expect(parseEditableNotes(blank).filter((note) => note.midi === 71)).toEqual(
      [],
    )
  })

  it('honours the supplied meter', () => {
    const sixEight = createBlankMusicXml({ beats: 6, beatType: 8 })
    expect(sixEight).toContain('<beats>6</beats>')
    expect(sixEight).toContain('<beat-type>8</beat-type>')
    expect(meterFromXml(sixEight)).toEqual({ beats: 6, beatType: 8 })
  })
})

describe('insertBlankNote', () => {
  it('writes a note with its chosen spelling', () => {
    const result = insertBlankNote(blank, {
      measureIndex: 0,
      startQ: 0,
      durQ: 1,
      midi: 70,
      step: 'B',
      alter: -1,
    })
    expect(typeof result).not.toBe('string')
    if (typeof result === 'string') {
      return
    }
    expect(result.xml).toContain(
      '<step>B</step><alter>-1</alter><octave>4</octave>',
    )
    expect(notesFromBlankXml(result.xml)[0]).toMatchObject({
      measureIndex: 0,
      startQ: 0,
      durQ: 1,
      midi: 70,
      step: 'B',
      alter: -1,
    })
  })

  it('keeps the flat spelling through normalisation', () => {
    const inserted = insertBlankNote(blank, {
      measureIndex: 0,
      startQ: 0,
      durQ: 1,
      midi: 70,
      step: 'B',
      alter: -1,
    })
    if (typeof inserted === 'string') {
      throw new Error(inserted)
    }
    const normalised = normalizeBlankXml(inserted.xml)
    expect(normalised).toContain(
      '<step>B</step><alter>-1</alter><octave>4</octave>',
    )
    expect(notesFromBlankXml(normalised)[0].alter).toBe(-1)
  })

  it('rejects an occupied spot', () => {
    const first = insertBlankNote(blank, {
      measureIndex: 0,
      startQ: 0,
      durQ: 1,
      midi: 62,
    })
    if (typeof first === 'string') {
      throw new Error(first)
    }
    const second = insertBlankNote(first.xml, {
      measureIndex: 0,
      startQ: 0,
      durQ: 1,
      midi: 64,
    })
    expect(typeof second).toBe('string')
    expect(second).toContain('occupied')
  })

  it('rejects a note that overflows the bar', () => {
    const result = insertBlankNote(blank, {
      measureIndex: 0,
      startQ: 3.5,
      durQ: 1,
      midi: 62,
    })
    expect(typeof result).toBe('string')
  })
})

describe('changeBlankMeter', () => {
  it('drops notes that no longer fit and reports the count', () => {
    const first = insertBlankNote(blank, {
      measureIndex: 0,
      startQ: 2.5,
      durQ: 1,
      midi: 62,
    })
    if (typeof first === 'string') {
      throw new Error(first)
    }
    const result = changeBlankMeter(first.xml, { beats: 2, beatType: 4 })
    expect(result.dropped).toBe(1)
    expect(notesFromBlankXml(result.xml)).toEqual([])
    expect(result.xml).toContain('<beats>2</beats>')
  })
})

describe('moveBlankNote', () => {
  const inserted = insertBlankNote(blank, {
    measureIndex: 0,
    startQ: 0,
    durQ: 1,
    midi: 62,
  })
  if (typeof inserted === 'string') {
    throw new Error(inserted)
  }

  it('moves a note within the bar', () => {
    const result = moveBlankNote(inserted.xml, inserted.selection, 1)
    expect(typeof result).not.toBe('string')
    if (typeof result === 'string') {
      return
    }
    expect(result.selection.onsetQ).toBe(1)
    expect(result.durationQ).toBe(1)
    expect(notesFromBlankXml(result.xml)[0].startQ).toBe(1)
  })

  it('moves a note into the next bar', () => {
    const lastBeat = insertBlankNote(blank, {
      measureIndex: 0,
      startQ: 3,
      durQ: 1,
      midi: 62,
    })
    if (typeof lastBeat === 'string') {
      throw new Error(lastBeat)
    }
    const result = moveBlankNote(lastBeat.xml, lastBeat.selection, 1)
    expect(typeof result).not.toBe('string')
    if (typeof result === 'string') {
      return
    }
    expect(result.selection.measureIndex).toBe(1)
    expect(result.selection.onsetQ).toBe(0)
  })

  it('refuses to move onto another note', () => {
    const two = insertBlankNote(inserted.xml, {
      measureIndex: 0,
      startQ: 2,
      durQ: 1,
      midi: 64,
    })
    if (typeof two === 'string') {
      throw new Error(two)
    }
    const result = moveBlankNote(two.xml, inserted.selection, 2)
    expect(typeof result).toBe('string')
    expect(result).toContain('already a note')
  })
})

describe('meterFromXml', () => {
  it('falls back to 4/4 for invalid input', () => {
    expect(meterFromXml('<not-xml')).toEqual({ beats: 4, beatType: 4 })
    expect(meterFromXml('<root/>')).toEqual({ beats: 4, beatType: 4 })
  })
})
