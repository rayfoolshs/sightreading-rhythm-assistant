// Pitch spelling helpers.
//
// Editing a pitch through a MIDI number alone loses the notation: B flat and
// A sharp sound the same but must be engraved differently. These helpers keep
// the chosen letter and accidental whenever the new pitch can be written with
// them, and otherwise spell by key-signature preference.

export const STEP_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

export type SpellingPreference = 'sharps' | 'flats'

export interface PitchSpelling {
  step: string
  alter: number
}

const SHARP_SPELLINGS: PitchSpelling[] = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
]

const FLAT_SPELLINGS: PitchSpelling[] = [
  { step: 'C', alter: 0 },
  { step: 'D', alter: -1 },
  { step: 'D', alter: 0 },
  { step: 'E', alter: -1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'G', alter: -1 },
  { step: 'G', alter: 0 },
  { step: 'A', alter: -1 },
  { step: 'A', alter: 0 },
  { step: 'B', alter: -1 },
  { step: 'B', alter: 0 },
]

export function midiFromPitch(
  step: string,
  alter: number,
  octave: number,
): number {
  const semitone = STEP_SEMITONES[step]
  if (semitone === undefined) {
    return 60
  }
  return (octave + 1) * 12 + semitone + alter
}

/** The octave that makes `step`/`alter` land on `midi`. */
export function octaveFor(midi: number, step: string, alter: number): number {
  return Math.round((midi - (STEP_SEMITONES[step] ?? 0) - alter) / 12) - 1
}

/** True when the spelling lands on the given MIDI number. */
export function fitsSpelling(
  midi: number,
  step: string,
  alter: number,
): boolean {
  if (STEP_SEMITONES[step] === undefined) {
    return false
  }
  return midiFromPitch(step, alter, octaveFor(midi, step, alter)) === midi
}

export function spellMidi(
  midi: number,
  preference: SpellingPreference = 'sharps',
): PitchSpelling {
  const table = preference === 'flats' ? FLAT_SPELLINGS : SHARP_SPELLINGS
  return table[((midi % 12) + 12) % 12]
}

/** Flat keys are negative (<fifths>); sharp keys are positive. */
export function preferFromFifths(fifths: number): SpellingPreference {
  return fifths < 0 ? 'flats' : 'sharps'
}

/**
 * Transpose one written pitch, keeping its letter and accidental where the
 * notation allows. The palette only produces octave (±12) and chromatic
 * (±1) moves; those keep the spelling stable (B flat up an octave stays B
 * flat, B flat raised a semitone becomes B natural).
 */
export function transposeSpelling(
  step: string,
  alter: number,
  midi: number,
  semitones: number,
  preference: SpellingPreference = 'sharps',
): PitchSpelling {
  const target = midi + semitones
  const stepIndex = STEP_ORDER.indexOf(
    step as (typeof STEP_ORDER)[number],
  )
  const letter = stepIndex >= 0 ? step : 'C'

  // Octaves keep the written letter and accidental.
  if (semitones !== 0 && semitones % 12 === 0) {
    return { step: letter, alter }
  }

  // Chromatic moves: prefer the accidental on the same letter, but spill onto
  // the neighbouring letter at the double-accidental boundary.
  if (semitones === 1) {
    if (alter === 1 && stepIndex >= 0) {
      return { step: STEP_ORDER[(stepIndex + 1) % 7], alter: 0 }
    }
    return { step: letter, alter: alter + 1 }
  }
  if (semitones === -1) {
    if (alter === -1 && stepIndex >= 0) {
      return { step: STEP_ORDER[(stepIndex + 6) % 7], alter: 0 }
    }
    return { step: letter, alter: alter - 1 }
  }

  const spelling = spellMidi(target, preference)
  if (spelling.step !== letter || semitones % 12 === 0) {
    return spelling
  }
  // A wider interval must change the letter; move to the next diatonic step
  // and let the accidental absorb the difference.
  if (stepIndex < 0) {
    return spelling
  }
  const nextStep = STEP_ORDER[
    (stepIndex + (semitones > 0 ? 1 : 6)) % 7
  ]
  const nextAlter =
    target - (octaveFor(target, nextStep, 0) + 1) * 12 - STEP_SEMITONES[nextStep]
  return { step: nextStep, alter: nextAlter }
}
