import { describe, expect, it } from 'vitest'
import {
  fitsSpelling,
  midiFromPitch,
  octaveFor,
  preferFromFifths,
  spellMidi,
  transposeSpelling,
} from './spelling'

describe('midiFromPitch', () => {
  it('converts written pitches to MIDI', () => {
    expect(midiFromPitch('C', 0, 4)).toBe(60)
    expect(midiFromPitch('B', -1, 4)).toBe(70)
    expect(midiFromPitch('F', 1, 4)).toBe(66)
    expect(midiFromPitch('A', 0, 4)).toBe(69)
  })

  it('matches octaveFor for every pitch class', () => {
    for (const step of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      for (const alter of [-1, 0, 1]) {
        for (let midi = 24; midi <= 100; midi += 1) {
          if (!fitsSpelling(midi, step, alter)) {
            continue
          }
          expect(midiFromPitch(step, alter, octaveFor(midi, step, alter))).toBe(
            midi,
          )
        }
      }
    }
  })
})

describe('spellMidi', () => {
  it('spells sharp keys with sharps', () => {
    expect(spellMidi(70, 'sharps')).toEqual({ step: 'A', alter: 1 })
    expect(spellMidi(73, 'sharps')).toEqual({ step: 'C', alter: 1 })
    expect(spellMidi(66, 'sharps')).toEqual({ step: 'F', alter: 1 })
  })

  it('spells flat keys with flats', () => {
    expect(spellMidi(70, 'flats')).toEqual({ step: 'B', alter: -1 })
    expect(spellMidi(73, 'flats')).toEqual({ step: 'D', alter: -1 })
    expect(spellMidi(63, 'flats')).toEqual({ step: 'E', alter: -1 })
  })

  it('leaves naturals alone', () => {
    expect(spellMidi(60, 'flats')).toEqual({ step: 'C', alter: 0 })
  })
})

describe('preferFromFifths', () => {
  it('uses flats for flat keys and sharps otherwise', () => {
    expect(preferFromFifths(-3)).toBe('flats')
    expect(preferFromFifths(0)).toBe('sharps')
    expect(preferFromFifths(4)).toBe('sharps')
  })
})

describe('transposeSpelling', () => {
  it('keeps the written spelling across octaves', () => {
    expect(transposeSpelling('B', -1, 70, 12)).toEqual({
      step: 'B',
      alter: -1,
    })
    expect(transposeSpelling('B', -1, 70, -12)).toEqual({
      step: 'B',
      alter: -1,
    })
    expect(transposeSpelling('F', 1, 66, 24)).toEqual({
      step: 'F',
      alter: 1,
    })
  })

  it('sharpens the same letter by a semitone', () => {
    expect(transposeSpelling('C', 0, 60, 1)).toEqual({ step: 'C', alter: 1 })
    expect(transposeSpelling('B', -1, 70, 1)).toEqual({ step: 'B', alter: 0 })
  })

  it('flattens the same letter by a semitone', () => {
    expect(transposeSpelling('F', 1, 66, -1)).toEqual({ step: 'F', alter: 0 })
    expect(transposeSpelling('C', 0, 60, -1)).toEqual({ step: 'C', alter: -1 })
  })

  it('moves to the neighbouring letter at a double accidental', () => {
    expect(transposeSpelling('F', 1, 66, 1)).toEqual({ step: 'G', alter: 0 })
    expect(transposeSpelling('B', -1, 70, -1)).toEqual({ step: 'A', alter: 0 })
  })

  it('uses the key preference for wider intervals', () => {
    expect(transposeSpelling('B', -1, 70, 3, 'flats')).toEqual({
      step: 'D',
      alter: -1,
    })
    expect(transposeSpelling('B', -1, 70, 3, 'sharps')).toEqual({
      step: 'C',
      alter: 1,
    })
  })
})
