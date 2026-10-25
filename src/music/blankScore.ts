import type { NoteSelection } from './types'
import { durationType, parseEditableNotes } from './musicxmlEditor'
import { fitsSpelling, octaveFor, spellMidi } from './spelling'

export interface TimeSignatureValue {
  beats: number
  beatType: number
}

export interface BlankNoteInput {
  measureIndex: number
  startQ: number
  durQ: number
  midi: number
  /** Preferred written letter, so flats survive a round-trip. */
  step?: string
  alter?: number
}

export const BLANK_MEASURE_COUNT = 8

const REST_VALUES = [4, 2, 1, 0.5, 0.25, 0.125]

function isCompound(meter: TimeSignatureValue): boolean {
  return meter.beatType === 8 && meter.beats > 3 && meter.beats % 3 === 0
}

export function measureDurationQ(meter: TimeSignatureValue): number {
  return meter.beats * (4 / meter.beatType)
}

export function pulseUnitQ(meter: TimeSignatureValue): number {
  return isCompound(meter) ? 0.5 : 4 / meter.beatType
}

export function meterFromXml(xml: string): TimeSignatureValue {
  try {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const time = document.getElementsByTagName('time')[0]
    if (!time) {
      return { beats: 4, beatType: 4 }
    }
    const beats = Number(time.getElementsByTagName('beats')[0]?.textContent)
    const beatType = Number(
      time.getElementsByTagName('beat-type')[0]?.textContent,
    )
    if (!beats || !beatType) {
      return { beats: 4, beatType: 4 }
    }
    return { beats, beatType }
  } catch {
    return { beats: 4, beatType: 4 }
  }
}

function pitchXml(note: BlankNoteInput): string {
  const spelling =
    note.step !== undefined &&
    note.alter !== undefined &&
    fitsSpelling(note.midi, note.step, note.alter)
      ? { step: note.step, alter: note.alter }
      : spellMidi(note.midi)
  const octave = octaveFor(note.midi, spelling.step, spelling.alter)
  const alterXml =
    spelling.alter === 0 ? '' : `<alter>${spelling.alter}</alter>`
  return `<pitch><step>${spelling.step}</step>${alterXml}<octave>${octave}</octave></pitch>`
}

function typeXml(durationQ: number): string {
  const match = durationType(durationQ)
  if (!match) {
    return ''
  }
  return `<type>${match.type}</type>${'<dot/>'.repeat(match.dots)}`
}

function noteXml(note: BlankNoteInput): string {
  const duration = Math.round(note.durQ * 8)
  return `<note>${pitchXml(note)}<duration>${duration}</duration><voice>1</voice>${typeXml(note.durQ)}</note>`
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
  for (const value of REST_VALUES) {
    while (remaining >= value - 0.0001) {
      parts.push(restXml(value))
      remaining -= value
    }
  }
  if (remaining > 0.0001) {
    parts.push(restXml(Math.round(remaining * 8) / 8))
  }
  return parts
}

function emptyMeasureAnchors(meter: TimeSignatureValue): string {
  const unit = pulseUnitQ(meter)
  const total = measureDurationQ(meter)
  const count = Math.max(1, Math.round(total / unit))
  const duration = Math.round(unit * 8)
  const type = typeXml(unit)
  const anchorPitch = pitchXml({
    measureIndex: 0,
    startQ: 0,
    durQ: unit,
    midi: 71,
    step: 'B',
    alter: 0,
  })
  const anchors = Array.from(
    { length: count },
    () =>
      `<note print-object="no">${anchorPitch}<duration>${duration}</duration><voice>2</voice>${type}</note>`,
  ).join('')
  return `<note><rest measure="yes"/><duration>${Math.round(total * 8)}</duration><voice>1</voice><type>whole</type></note><backup><duration>${Math.round(total * 8)}</duration></backup>${anchors}`
}

function attributesXml(meter: TimeSignatureValue): string {
  return `<attributes><divisions>8</divisions><key><fifths>0</fifths></key><time><beats>${meter.beats}</beats><beat-type>${meter.beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><sound tempo="84"/>`
}

export function createBlankMusicXml(
  meter: TimeSignatureValue = { beats: 4, beatType: 4 },
  notes: BlankNoteInput[] = [],
  measureCount = BLANK_MEASURE_COUNT,
): string {
  const total = measureDurationQ(meter)
  const measures: string[] = []
  for (let index = 0; index < measureCount; index += 1) {
    const measureNotes = notes
      .filter((note) => note.measureIndex === index)
      .sort((a, b) => a.startQ - b.startQ)
    const body: string[] = []
    if (measureNotes.length === 0) {
      body.push(emptyMeasureAnchors(meter))
    } else {
      let cursor = 0
      for (const note of measureNotes) {
        if (note.startQ > cursor + 0.0001) {
          body.push(...splitRest(note.startQ - cursor))
        }
        body.push(noteXml(note))
        cursor = note.startQ + note.durQ
      }
      if (cursor < total - 0.0001) {
        body.push(...splitRest(total - cursor))
      }
    }
    const attributes = index === 0 ? attributesXml(meter) : ''
    const barline =
      index === measureCount - 1
        ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>'
        : ''
    measures.push(
      `<measure number="${index + 1}">${attributes}${body.join('')}${barline}</measure>`,
    )
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Blank Staff</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${measures.join('')}</part>
</score-partwise>`
}

export function notesFromBlankXml(xml: string): BlankNoteInput[] {
  return parseEditableNotes(xml)
    .filter((note) => !note.isRest && note.midi !== null)
    .map((note) => {
      const pitch = Array.from(note.element.children).find(
        (child) => child.tagName === 'pitch',
      )
      const step = pitch
        ?.getElementsByTagName('step')[0]
        ?.textContent?.trim()
      const alterText = pitch?.getElementsByTagName('alter')[0]?.textContent
      const parsedAlter = alterText === undefined ? 0 : Number(alterText)
      return {
        measureIndex: note.measureIndex,
        startQ: note.onsetQ,
        durQ: note.durationQ,
        midi: note.midi as number,
        step: step || undefined,
        alter: Number.isFinite(parsedAlter) ? parsedAlter : 0,
      }
    })
}

export function insertBlankNote(
  xml: string,
  input: BlankNoteInput,
  measureCount = BLANK_MEASURE_COUNT,
): { xml: string; selection: NoteSelection } | string {
  const meter = meterFromXml(xml)
  const total = measureDurationQ(meter)
  const end = input.startQ + input.durQ
  if (
    input.measureIndex < 0 ||
    input.measureIndex >= measureCount ||
    input.startQ < 0 ||
    input.durQ <= 0 ||
    end > total + 0.0001
  ) {
    return 'That note does not fit in the bar. Try a shorter value or an earlier beat.'
  }
  const notes = notesFromBlankXml(xml)
  const occupied = notes.some(
    (note) =>
      note.measureIndex === input.measureIndex &&
      input.startQ < note.startQ + note.durQ - 0.0001 &&
      end > note.startQ + 0.0001,
  )
  if (occupied) {
    return 'That spot is already occupied. Select the note to edit it, or use Undo.'
  }
  const nextNotes = [...notes, input]
  return {
    xml: createBlankMusicXml(meter, nextNotes, measureCount),
    selection: {
      measureIndex: input.measureIndex,
      onsetQ: input.startQ,
      midi: input.midi,
    },
  }
}

export function normalizeBlankXml(xml: string): string {
  const meter = meterFromXml(xml)
  return createBlankMusicXml(meter, notesFromBlankXml(xml))
}

export function changeBlankMeter(
  xml: string,
  meter: TimeSignatureValue,
  measureCount = BLANK_MEASURE_COUNT,
): { xml: string; dropped: number } {
  const total = measureDurationQ(meter)
  const notes = notesFromBlankXml(xml)
  const kept = notes.filter((note) => note.startQ + note.durQ <= total + 0.0001)
  return {
    xml: createBlankMusicXml(meter, kept, measureCount),
    dropped: notes.length - kept.length,
  }
}

export function moveBlankNote(
  xml: string,
  selection: NoteSelection,
  deltaQ: number,
  measureCount = BLANK_MEASURE_COUNT,
): { xml: string; selection: NoteSelection; durationQ: number } | string {
  if (selection.midi === null) {
    return 'Select a note to move it.'
  }
  const meter = meterFromXml(xml)
  const total = measureDurationQ(meter)
  const notes = notesFromBlankXml(xml)
  const note = notes.find(
    (item) =>
      item.measureIndex === selection.measureIndex &&
      Math.abs(item.startQ - selection.onsetQ) < 0.02 &&
      item.midi === selection.midi,
  )
  if (!note) {
    return 'Could not find that note in the score.'
  }

  let measureIndex = note.measureIndex
  let startQ = note.startQ + deltaQ
  if (startQ < -0.0001) {
    if (measureIndex === 0) {
      startQ = 0
    } else {
      measureIndex -= 1
      startQ = total - note.durQ
    }
  } else if (startQ + note.durQ > total + 0.0001) {
    if (measureIndex >= measureCount - 1) {
      return 'That note is already at the end of the staff.'
    }
    measureIndex += 1
    startQ = 0
  }
  if (startQ < 0 || startQ + note.durQ > total + 0.0001) {
    return 'That note does not fit in the target bar.'
  }

  const collision = notes.some(
    (other) =>
      other.measureIndex === measureIndex &&
      !(
        other.measureIndex === note.measureIndex &&
        Math.abs(other.startQ - note.startQ) < 0.02 &&
        other.midi === note.midi
      ) &&
      startQ < other.startQ + other.durQ - 0.0001 &&
      startQ + note.durQ > other.startQ + 0.0001,
  )
  if (collision) {
    return 'There is already a note at that position.'
  }

  const moved = notes
    .filter((other) => other !== note)
    .concat({
      measureIndex,
      startQ,
      durQ: note.durQ,
      midi: note.midi,
    })
  return {
    xml: createBlankMusicXml(meter, moved, measureCount),
    selection: { measureIndex, onsetQ: startQ, midi: note.midi },
    durationQ: note.durQ,
  }
}
