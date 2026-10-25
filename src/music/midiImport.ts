import { Midi } from '@tonejs/midi'
import { durationType } from './musicxmlEditor'
import { octaveFor, preferFromFifths, spellMidi } from './spelling'

const GRID_Q = 0.25
const MIN_DURATION = 0.25
const MAX_PARTS = 8
const STANDARD_DURATIONS = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25]

interface ImportedNote {
  startQ: number
  durQ: number
  midi: number
}

interface ImportedPart {
  name: string
  clef: 'G' | 'F'
  notes: ImportedNote[]
}

export interface MidiImportResult {
  xml: string
  title: string
  partCount: number
}

const KEY_SIGNATURE_KEYS = [
  'Cb',
  'Gb',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
]

const MINOR_TO_MAJOR: Record<string, string> = {
  A: 'C',
  E: 'G',
  B: 'D',
  'F#': 'A',
  'C#': 'E',
  'G#': 'B',
  'D#': 'F#',
  'A#': 'C#',
  D: 'F',
  G: 'Bb',
  C: 'Eb',
  F: 'Ab',
  Bb: 'Db',
  Eb: 'Gb',
  Ab: 'Cb',
}

function quantize(value: number): number {
  return Math.max(0, Math.round(value / GRID_Q) * GRID_Q)
}

function fitDuration(value: number, available: number): number | null {
  const limit = Math.min(value, available)
  let best = 0
  for (const candidate of STANDARD_DURATIONS) {
    if (candidate <= limit + 0.0001) {
      best = Math.max(best, candidate)
    }
  }
  return best >= MIN_DURATION ? best : null
}

function pitchXml(midi: number, fifths: number): string {
  const { step, alter } = spellMidi(midi, preferFromFifths(fifths))
  const octave = octaveFor(midi, step, alter)
  const alterXml = alter === 0 ? '' : `<alter>${alter}</alter>`
  return `<pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>`
}

function typeXml(durationQ: number): string {
  const match = durationType(durationQ)
  if (!match) {
    return ''
  }
  return `<type>${match.type}</type>${'<dot/>'.repeat(match.dots)}`
}

function noteXml(
  midi: number,
  durationQ: number,
  isChord: boolean,
  fifths: number,
): string {
  const duration = Math.round(durationQ * 8)
  const chord = isChord ? '<chord/>' : ''
  return `<note>${chord}${pitchXml(midi, fifths)}<duration>${duration}</duration><voice>1</voice>${typeXml(durationQ)}</note>`
}

function restXml(durationQ: number): string {
  const duration = Math.round(durationQ * 8)
  return `<note><rest/><duration>${duration}</duration><voice>1</voice>${typeXml(durationQ)}</note>`
}

function splitRest(durationQ: number): string[] {
  if (durationType(durationQ)) {
    return [restXml(durationQ)]
  }
  let remaining = durationQ
  const parts: string[] = []
  for (const value of [4, 2, 1, 0.5, 0.25]) {
    while (remaining >= value - 0.0001) {
      parts.push(restXml(value))
      remaining -= value
    }
  }
  return parts
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function keyFifths(midi: Midi): number {
  const signature = midi.header.keySignatures[0]
  if (!signature) {
    return 0
  }
  const key =
    signature.scale === 'minor'
      ? (MINOR_TO_MAJOR[signature.key] ?? signature.key)
      : signature.key
  const index = KEY_SIGNATURE_KEYS.indexOf(key)
  return index >= 0 ? index - 7 : 0
}

function clefFor(notes: ImportedNote[]): 'G' | 'F' {
  if (notes.length === 0) {
    return 'G'
  }
  const average =
    notes.reduce((sum, note) => sum + note.midi, 0) / notes.length
  return average < 60 ? 'F' : 'G'
}

function groupByOnset(notes: ImportedNote[]): ImportedNote[][] {
  const groups = new Map<number, ImportedNote[]>()
  for (const note of notes) {
    const key = Math.round(note.startQ / GRID_Q)
    const group = groups.get(key)
    if (group) {
      group.push(note)
    } else {
      groups.set(key, [note])
    }
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => group)
}

function measureNotes(
  notes: ImportedNote[],
  measureIndex: number,
  measureQ: number,
  fifths: number,
): string {
  const starts = notes
    .map((note) => ({
      startQ: note.startQ - measureIndex * measureQ,
      midi: note.midi,
      durQ: note.durQ,
    }))
    .filter((note) => note.startQ >= -0.0001 && note.startQ < measureQ - 0.0001)
  if (starts.length === 0) {
    return `<note><rest measure="yes"/><duration>${Math.round(measureQ * 8)}</duration><voice>1</voice><type>whole</type></note>`
  }

  const groups = groupByOnset(
    starts.map((note) => ({
      ...note,
      startQ: quantize(note.startQ),
    })),
  )
  const body: string[] = []
  let cursor = 0
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const startQ = group[0].startQ
    const nextStart = groups[index + 1]?.[0].startQ ?? measureQ
    if (startQ > cursor + 0.0001) {
      body.push(...splitRest(quantize(startQ - cursor)))
    }
    const available = Math.max(0, Math.min(measureQ, nextStart) - startQ)
    const desired = Math.max(...group.map((note) => note.durQ))
    const duration = fitDuration(desired, available)
    if (!duration) {
      cursor = Math.max(cursor, startQ)
      continue
    }
    const unique = new Map<number, ImportedNote>()
    for (const note of group) {
      if (!unique.has(note.midi)) {
        unique.set(note.midi, note)
      }
    }
    const pitches = Array.from(unique.values()).sort(
      (a, b) => a.midi - b.midi,
    )
    pitches.forEach((note, pitchIndex) => {
      body.push(noteXml(note.midi, duration, pitchIndex > 0, fifths))
    })
    cursor = startQ + duration
  }
  if (cursor < measureQ - 0.0001) {
    body.push(...splitRest(quantize(measureQ - cursor)))
  }
  return body.join('')
}

function buildPartXml(
  part: ImportedPart,
  index: number,
  measures: number,
  measureQ: number,
  beats: number,
  beatType: number,
  fifths: number,
  bpm: number,
): string {
  const measureXml: string[] = []
  for (let measureIndex = 0; measureIndex < measures; measureIndex += 1) {
    const attributes =
      measureIndex === 0
        ? `<attributes><divisions>8</divisions><key><fifths>${fifths}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>${part.clef}</sign><line>${part.clef === 'G' ? 2 : 4}</line></clef></attributes>${
            index === 0 ? `<sound tempo="${Math.round(bpm)}"/>` : ''
          }`
        : ''
    const notes = part.notes
      .filter(
        (note) =>
          Math.floor(note.startQ / measureQ) === measureIndex,
      )
      .map((note) => ({
        ...note,
        startQ: note.startQ,
      }))
    const body = measureNotes(notes, measureIndex, measureQ, fifths)
    const barline =
      measureIndex === measures - 1
        ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>'
        : ''
    measureXml.push(
      `<measure number="${measureIndex + 1}">${attributes}${body}${barline}</measure>`,
    )
  }
  return `<part id="P${index + 1}">${measureXml.join('')}</part>`
}

export function midiToMusicXml(
  data: ArrayBuffer,
  fallbackTitle = 'Imported MIDI',
): MidiImportResult {
  let midi: Midi
  try {
    midi = new Midi(data)
  } catch {
    throw new Error('That file could not be read as a MIDI file.')
  }

  const ppq = midi.header.ppq || 480
  const timeSignature = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const beats = timeSignature[0] || 4
  const beatType = timeSignature[1] || 4
  const measureQ = beats * (4 / beatType)
  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const fifths = keyFifths(midi)

  const parts: ImportedPart[] = []
  midi.tracks.forEach((track, trackIndex) => {
    if (track.notes.length === 0 || track.instrument.percussion) {
      return
    }
    const notes: ImportedNote[] = track.notes
      .map((note) => ({
        startQ: quantize(note.ticks / ppq),
        durQ: quantize(note.durationTicks / ppq),
        midi: note.midi,
      }))
      .filter((note) => note.durQ >= MIN_DURATION)
    if (notes.length === 0) {
      return
    }
    const name =
      track.name.trim() ||
      track.instrument.name ||
      `Track ${trackIndex + 1}`
    const below = notes.filter((note) => note.midi < 60)
    const above = notes.filter((note) => note.midi >= 60)
    const range =
      Math.max(...notes.map((note) => note.midi)) -
      Math.min(...notes.map((note) => note.midi))

    if (below.length > 0 && above.length > 0 && range >= 24) {
      parts.push({
        name: `${name} · upper`,
        clef: 'G',
        notes: above,
      })
      parts.push({
        name: `${name} · lower`,
        clef: 'F',
        notes: below,
      })
    } else {
      parts.push({
        name,
        clef: clefFor(notes),
        notes,
      })
    }
  })

  if (parts.length === 0) {
    throw new Error(
      'No playable pitched notes were found. Drum-only MIDI files are not supported.',
    )
  }
  if (parts.length > MAX_PARTS) {
    throw new Error(
      `This MIDI has ${parts.length} parts. Import a simpler file with at most ${MAX_PARTS} pitched tracks.`,
    )
  }

  let measureCount = 1
  for (const part of parts) {
    for (const note of part.notes) {
      measureCount = Math.max(
        measureCount,
        Math.floor(note.startQ / measureQ) + 1,
      )
    }
  }

  for (const part of parts) {
    part.notes = part.notes
      .map((note) => {
        let measureIndex = Math.floor(note.startQ / measureQ)
        let startQ = note.startQ - measureIndex * measureQ
        if (startQ >= measureQ - 0.0001) {
          measureIndex += 1
          startQ = 0
        }
        return {
          ...note,
          startQ: measureIndex * measureQ + startQ,
        }
      })
      .filter((note) => note.startQ < measureCount * measureQ)
  }

  const title =
    midi.name.trim() || fallbackTitle.replace(/\.[^.]+$/, '') || 'Imported MIDI'
  const partList = parts
    .map(
      (part, index) =>
        `<score-part id="P${index + 1}"><part-name>${escapeXml(part.name)}</part-name></score-part>`,
    )
    .join('')

  const partXml = parts
    .map((part, index) =>
      buildPartXml(
        part,
        index,
        measureCount,
        measureQ,
        beats,
        beatType,
        fifths,
        bpm,
      ),
    )
    .join('')

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <part-list>${partList}</part-list>
  ${partXml}
</score-partwise>`,
    title,
    partCount: parts.length,
  }
}
