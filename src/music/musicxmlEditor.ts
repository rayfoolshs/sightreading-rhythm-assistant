import {
  midiFromPitch,
  octaveFor,
  preferFromFifths,
  spellMidi,
  transposeSpelling,
  type PitchSpelling,
} from './spelling'
import type { NoteSelection } from './types'

export { midiFromPitch } from './spelling'

export interface EditableNote {
  measureIndex: number
  partIndex: number
  onsetQ: number
  durationQ: number
  durationDiv: number
  divisions: number
  midi: number | null
  isRest: boolean
  isChord: boolean
  voice: string
  staff: string
  type: string
  dots: number
  element: Element
}

export interface EditResult {
  xml: string
  selection: NoteSelection
}

const DURATION_TYPES: Array<[string, number]> = [
  ['whole', 4],
  ['half', 2],
  ['quarter', 1],
  ['eighth', 0.5],
  ['16th', 0.25],
  ['32nd', 0.125],
]

function directChildren(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.tagName === name)
}

function childText(element: Element, name: string): string {
  return directChildren(element, name)[0]?.textContent?.trim() ?? ''
}

function childNumber(element: Element, name: string, fallback = 0): number {
  const value = Number(childText(element, name))
  return Number.isFinite(value) ? value : fallback
}

function hasChild(element: Element, name: string): boolean {
  return directChildren(element, name).length > 0
}

export function noteNameFromMidi(
  midi: number,
  spelling?: PitchSpelling,
): string {
  const { step, alter } = spelling ?? spellMidi(midi)
  const octave = Math.floor(midi / 12) - 1
  const accidental = alter === 1 ? '♯' : alter === -1 ? '♭' : ''
  return `${step}${accidental}${octave}`
}

export function parseEditableNotes(xml: string): EditableNote[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    return []
  }
  const parts = Array.from(document.getElementsByTagName('part'))
  const notes: EditableNote[] = []

  parts.forEach((part, partIndex) => {
    let divisions = 1
    const measures = Array.from(part.children).filter(
      (element) => element.tagName === 'measure',
    )
    measures.forEach((measure, measureIndex) => {
      let cursorDiv = 0
      let lastOnsetDiv = 0
      Array.from(measure.children).forEach((element) => {
        if (element.tagName === 'attributes') {
          const nextDivisions = childNumber(element, 'divisions', 0)
          if (nextDivisions > 0) {
            divisions = nextDivisions
          }
          return
        }
        if (element.tagName === 'backup') {
          cursorDiv -= childNumber(element, 'duration')
          return
        }
        if (element.tagName === 'forward') {
          cursorDiv += childNumber(element, 'duration')
          return
        }
        if (element.tagName !== 'note') {
          return
        }
        if (element.getAttribute('print-object') === 'no') {
          return
        }
        const durationDiv = childNumber(element, 'duration')
        if (durationDiv <= 0) {
          return
        }
        const isChord = hasChild(element, 'chord')
        const isRest = hasChild(element, 'rest')
        const onsetDiv = isChord ? lastOnsetDiv : cursorDiv
        if (!isChord) {
          cursorDiv += durationDiv
          lastOnsetDiv = onsetDiv
        }
        const pitch = directChildren(element, 'pitch')[0]
        let midi: number | null = null
        if (pitch) {
          midi = midiFromPitch(
            childText(pitch, 'step'),
            childNumber(pitch, 'alter'),
            childNumber(pitch, 'octave', 4),
          )
        }
        const typeElement = directChildren(element, 'type')[0]
        notes.push({
          measureIndex,
          partIndex,
          onsetQ: onsetDiv / divisions,
          durationQ: durationDiv / divisions,
          durationDiv,
          divisions,
          midi,
          isRest,
          isChord,
          voice: childText(element, 'voice') || '1',
          staff: childText(element, 'staff') || '1',
          type: typeElement?.textContent?.trim() ?? '',
          dots: directChildren(element, 'dot').length,
          element,
        })
      })
    })
  })
  return notes
}

export function findEditableNote(
  notes: EditableNote[],
  selection: NoteSelection,
): EditableNote | undefined {
  const samePlace = notes.filter(
    (note) =>
      note.measureIndex === selection.measureIndex &&
      Math.abs(note.onsetQ - selection.onsetQ) < 0.02,
  )
  if (selection.midi === null) {
    return samePlace.find((note) => note.isRest)
  }
  const exact = samePlace.find((note) => note.midi === selection.midi)
  if (exact) {
    return exact
  }
  return samePlace
    .filter((note) => note.midi !== null)
    .sort(
      (a, b) =>
        Math.abs((a.midi ?? 0) - selection.midi!) -
        Math.abs((b.midi ?? 0) - selection.midi!),
    )[0]
}

function chordMembers(notes: EditableNote[], note: EditableNote): EditableNote[] {
  return notes.filter(
    (candidate) =>
      candidate.partIndex === note.partIndex &&
      candidate.measureIndex === note.measureIndex &&
      candidate.voice === note.voice &&
      !candidate.isRest &&
      Math.abs(candidate.onsetQ - note.onsetQ) < 0.02,
  )
}

function hasTie(element: Element, type: 'start' | 'stop'): boolean {
  const direct = directChildren(element, 'tie').some(
    (tie) => tie.getAttribute('type') === type,
  )
  if (direct) {
    return true
  }
  return Array.from(element.getElementsByTagName('tied')).some(
    (tie) => tie.getAttribute('type') === type,
  )
}

/**
 * Follow a tie chain forward. MusicXML writes one `<note>` per tied segment,
 * so deleting only the first segment leaves the rest of the note on screen.
 */
function tieChain(notes: EditableNote[], note: EditableNote): EditableNote[] {
  if (note.isRest || !hasTie(note.element, 'start')) {
    return [note]
  }
  const chain = [note]
  let current = note
  while (hasTie(current.element, 'start')) {
    const index = notes.indexOf(current)
    const next = notes
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.partIndex === current.partIndex &&
          candidate.voice === current.voice &&
          candidate.staff === current.staff &&
          candidate.midi === current.midi &&
          !candidate.isRest &&
          hasTie(candidate.element, 'stop'),
      )
    if (!next || chain.includes(next)) {
      break
    }
    chain.push(next)
    current = next
  }
  return chain
}

function serialize(document: Document): string {
  const xml = new XMLSerializer().serializeToString(document)
  return xml.startsWith('<?xml')
    ? xml
    : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
}

export function validateMusicXml(xml: string): string | null {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    return 'That is not valid XML. Check for a missing tag or quote.'
  }
  if (
    document.getElementsByTagName('score-partwise').length === 0 &&
    document.getElementsByTagName('score-timewise').length === 0
  ) {
    return 'This does not look like MusicXML (no score-partwise element).'
  }
  return null
}

function updatePitchElement(
  element: Element,
  midi: number,
  spelling: PitchSpelling = spellMidi(midi),
): void {
  directChildren(element, 'pitch').forEach((pitch) => pitch.remove())
  directChildren(element, 'unpitched').forEach((pitch) => pitch.remove())
  directChildren(element, 'accidental').forEach((pitch) => pitch.remove())
  directChildren(element, 'rest').forEach((rest) => rest.remove())

  const { step, alter } = spelling
  const octave = octaveFor(midi, step, alter)
  const pitch = element.ownerDocument.createElement('pitch')
  const stepElement = element.ownerDocument.createElement('step')
  stepElement.textContent = step
  pitch.appendChild(stepElement)
  if (alter !== 0) {
    const alterElement = element.ownerDocument.createElement('alter')
    alterElement.textContent = String(alter)
    pitch.appendChild(alterElement)
  }
  const octaveElement = element.ownerDocument.createElement('octave')
  octaveElement.textContent = String(octave)
  pitch.appendChild(octaveElement)

  const duration = directChildren(element, 'duration')[0]
  if (duration) {
    element.insertBefore(pitch, duration)
  } else {
    element.insertBefore(pitch, element.firstChild)
  }
}

function makeRest(element: Element): void {
  directChildren(element, 'pitch').forEach((node) => node.remove())
  directChildren(element, 'unpitched').forEach((node) => node.remove())
  directChildren(element, 'accidental').forEach((node) => node.remove())
  directChildren(element, 'rest').forEach((node) => node.remove())
  directChildren(element, 'beam').forEach((node) => node.remove())
  directChildren(element, 'stem').forEach((node) => node.remove())
  directChildren(element, 'tie').forEach((node) => node.remove())
  directChildren(element, 'notations').forEach((node) => node.remove())

  const rest = element.ownerDocument.createElement('rest')
  const duration = directChildren(element, 'duration')[0]
  if (duration) {
    element.insertBefore(rest, duration)
  } else {
    element.insertBefore(rest, element.firstChild)
  }
}

export function durationType(durationQ: number): { type: string; dots: number } | null {
  for (const [type, base] of DURATION_TYPES) {
    for (let dots = 0; dots <= 2; dots += 1) {
      const value = base * (2 - 0.5 ** dots)
      if (Math.abs(value - durationQ) < 0.001) {
        return { type, dots }
      }
    }
  }
  return null
}

function updateDurationElement(
  element: Element,
  durationDiv: number,
  durationQ: number,
): boolean {
  const match = durationType(durationQ)
  if (!match) {
    return false
  }
  const duration = directChildren(element, 'duration')[0]
  if (!duration) {
    return false
  }
  duration.textContent = String(durationDiv)
  let type = directChildren(element, 'type')[0]
  if (!type) {
    type = element.ownerDocument.createElement('type')
    duration.after(type)
  }
  type.textContent = match.type
  directChildren(element, 'dot').forEach((dot) => dot.remove())
  for (let index = 0; index < match.dots; index += 1) {
    type.after(element.ownerDocument.createElement('dot'))
  }
  return true
}

function withDocument(
  xml: string,
  edit: (document: Document) => EditResult | string,
): EditResult | string {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    return 'The score XML is not valid.'
  }
  const result = edit(document)
  if (typeof result === 'string') {
    return result
  }
  return result
}

export function transposeNote(
  xml: string,
  selection: NoteSelection,
  semitones: number,
): EditResult | string {
  if (selection.midi === null) {
    return 'Select a note (not a rest) to change its pitch.'
  }
  const notes = parseEditableNotes(xml)
  const note = findEditableNote(notes, selection)
  if (!note || note.midi === null || note.isRest) {
    return 'Could not find that note in the score.'
  }
  const midi = Math.max(0, Math.min(127, note.midi + semitones))
  const preference = preferFromFifths(keyFifthsFromXml(xml))
  return withDocument(xml, (document) => {
    const element = findElementByNote(document, note)
    if (!element) {
      return 'Could not find that note in the score.'
    }
    const pitch = directChildren(note.element, 'pitch')[0]
    const spelling = transposeSpelling(
      childText(pitch, 'step') || 'C',
      childNumber(pitch, 'alter'),
      note.midi as number,
      semitones,
      preference,
    )
    updatePitchElement(element, midi, spelling)
    return {
      xml: serialize(document),
      selection: { ...selection, midi },
    }
  })
}

/** The first key signature in the score, in fifths (-7 flats … +7 sharps). */
export function keyFifthsFromXml(xml: string): number {
  try {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const fifths = document.getElementsByTagName('fifths')[0]
    if (!fifths) {
      return 0
    }
    const value = Number(fifths.textContent)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function findElementByNote(
  document: Document,
  target: EditableNote,
): Element | null {
  const parts = Array.from(document.getElementsByTagName('part'))
  const part = parts[target.partIndex]
  if (!part) {
    return null
  }
  const measures = Array.from(part.children).filter(
    (element) => element.tagName === 'measure',
  )
  const measure = measures[target.measureIndex]
  if (!measure) {
    return null
  }
  // Divisions are inherited across measures. Scan the measures before the
  // target so notes in later measures can still be matched.
  let divisions = 1
  for (let index = 0; index < target.measureIndex; index += 1) {
    const previous = measures[index]
    if (!previous) {
      continue
    }
    for (const element of Array.from(previous.children)) {
      if (element.tagName === 'attributes') {
        const next = childNumber(element, 'divisions', 0)
        if (next > 0) {
          divisions = next
        }
      }
    }
  }
  let cursorDiv = 0
  let lastOnsetDiv = 0
  let found: Element | null = null
  for (const element of Array.from(measure.children)) {
    if (element.tagName === 'attributes') {
      const next = childNumber(element, 'divisions', 0)
      if (next > 0) {
        divisions = next
      }
      continue
    }
    if (element.tagName === 'backup') {
      cursorDiv -= childNumber(element, 'duration')
      continue
    }
    if (element.tagName === 'forward') {
      cursorDiv += childNumber(element, 'duration')
      continue
    }
    if (element.tagName !== 'note') {
      continue
    }
    if (element.getAttribute('print-object') === 'no') {
      continue
    }
    const durationDiv = childNumber(element, 'duration')
    const isChord = hasChild(element, 'chord')
    const onsetDiv = isChord ? lastOnsetDiv : cursorDiv
    if (!isChord) {
      cursorDiv += durationDiv
      lastOnsetDiv = onsetDiv
    }
    if (
      Math.abs(onsetDiv / divisions - target.onsetQ) < 0.02 &&
      Math.abs(durationDiv / divisions - target.durationQ) < 0.02 &&
      (childText(element, 'voice') || '1') === target.voice &&
      (childText(element, 'staff') || '1') === target.staff
    ) {
      const midi = hasChild(element, 'rest')
        ? null
        : midiFromPitch(
            childText(directChildren(element, 'pitch')[0], 'step'),
            childNumber(directChildren(element, 'pitch')[0], 'alter'),
            childNumber(directChildren(element, 'pitch')[0], 'octave', 4),
          )
      if (midi === target.midi || (midi === null && target.midi === null)) {
        found = element
        break
      }
    }
  }
  return found
}

export function toggleRest(
  xml: string,
  selection: NoteSelection,
): EditResult | string {
  const notes = parseEditableNotes(xml)
  const note = findEditableNote(notes, selection)
  if (!note) {
    return 'Could not find that note in the score.'
  }
  if (!note.isRest && chordMembers(notes, note).length > 1) {
    return 'Chord editing is not supported yet. Use the MusicXML editor for chords.'
  }
  return withDocument(xml, (document) => {
    const element = findElementByNote(document, note)
    if (!element) {
      return 'Could not find that note in the score.'
    }
    if (note.isRest) {
      updatePitchElement(element, 60, { step: 'C', alter: 0 })
      return {
        xml: serialize(document),
        selection: { ...selection, midi: 60 },
      }
    }
    makeRest(element)
    return {
      xml: serialize(document),
      selection: { ...selection, midi: null },
    }
  })
}

/**
 * Delete one notehead. A standalone note becomes a rest so the bar keeps its
 * length; a chord member is removed from the chord, and if it was the first
 * member the next one is promoted to be the chord's base note.
 */
export function deleteNote(
  xml: string,
  selection: NoteSelection,
): EditResult | string {
  const notes = parseEditableNotes(xml)
  const note = findEditableNote(notes, selection)
  if (!note) {
    return 'Could not match that notehead to the score. Click the note again and retry.'
  }
  if (note.isRest) {
    return 'That is already a rest.'
  }
  const members = chordMembers(notes, note)
  const others = members.filter((member) => member !== note)
  const chain = members.length <= 1 ? tieChain(notes, note) : [note]
  return withDocument(xml, (document) => {
    const element = findElementByNote(document, note)
    if (!element) {
      return 'Could not match that notehead to the score. Click the note again and retry.'
    }

    if (chain.length > 1) {
      for (const segment of chain) {
        const segmentElement = findElementByNote(document, segment)
        if (segmentElement) {
          makeRest(segmentElement)
        }
      }
      return {
        xml: serialize(document),
        selection: { ...selection, midi: null },
      }
    }

    const remaining = others[0]
    if (members.length <= 1 || !remaining) {
      makeRest(element)
      return {
        xml: serialize(document),
        selection: { ...selection, midi: null },
      }
    }

    const wasBaseNote = !hasChild(element, 'chord')
    element.remove()
    if (wasBaseNote) {
      const promoted = findElementByNote(document, remaining)
      if (promoted) {
        directChildren(promoted, 'chord').forEach((child) => child.remove())
      }
    }
    return {
      xml: serialize(document),
      selection: {
        measureIndex: remaining.measureIndex,
        onsetQ: remaining.onsetQ,
        midi: remaining.midi,
      },
    }
  })
}

export function setNoteDuration(
  xml: string,
  selection: NoteSelection,
  targetQ: number,
): EditResult | string {
  const notes = parseEditableNotes(xml)
  const note = findEditableNote(notes, selection)
  if (!note) {
    return 'Could not find that note in the score.'
  }
  if (chordMembers(notes, note).length > 1) {
    return 'Duration editing is not supported for chords yet. Use the MusicXML editor.'
  }
  if (Math.abs(targetQ - note.durationQ) < 0.001) {
    return { xml, selection }
  }
  if (!durationType(targetQ)) {
    return 'That note value is not supported.'
  }

  const later = notes
    .filter(
      (candidate) =>
        candidate.partIndex === note.partIndex &&
        candidate.measureIndex === note.measureIndex &&
        candidate.voice === note.voice &&
        candidate.onsetQ > note.onsetQ + 0.02,
    )
    .sort((a, b) => a.onsetQ - b.onsetQ)
  const nextOnset = later[0]?.onsetQ
  if (nextOnset === undefined) {
    return 'Use the MusicXML editor to resize the last note in a measure.'
  }
  const nextGroup = later.filter(
    (candidate) => Math.abs(candidate.onsetQ - nextOnset) < 0.02,
  )
  const nextDuration = nextGroup[0].durationQ
  const nextTarget = nextDuration - (targetQ - note.durationQ)
  if (nextTarget <= 0.05) {
    return 'There is not enough room in the following note.'
  }
  if (!durationType(nextTarget)) {
    return 'That change would create an unsupported rhythm. Try a different value.'
  }

  return withDocument(xml, (document) => {
    const target = findElementByNote(document, note)
    if (!target) {
      return 'Could not find that note in the score.'
    }
    const nextElements: Array<{ element: Element; divisions: number }> = []
    for (const next of nextGroup) {
      const nextElement = findElementByNote(document, next)
      if (!nextElement) {
        return 'Could not find the following note.'
      }
      nextElements.push({ element: nextElement, divisions: next.divisions })
    }
    if (
      !updateDurationElement(
        target,
        Math.round(targetQ * note.divisions),
        targetQ,
      )
    ) {
      return 'Could not apply that duration.'
    }
    for (const item of nextElements) {
      if (
        !updateDurationElement(
          item.element,
          Math.round(nextTarget * item.divisions),
          nextTarget,
        )
      ) {
        return 'Could not apply that duration to the following note.'
      }
    }
    return { xml: serialize(document), selection }
  })
}

export function naturalizeNote(
  xml: string,
  selection: NoteSelection,
): EditResult | string {
  if (selection.midi === null) {
    return 'Select a note (not a rest) to change its accidental.'
  }
  const notes = parseEditableNotes(xml)
  const note = findEditableNote(notes, selection)
  if (!note || note.midi === null || note.isRest) {
    return 'Could not find that note in the score.'
  }
  const pitch = directChildren(note.element, 'pitch')[0]
  if (!pitch) {
    return "Could not read that note's pitch."
  }
  const step = childText(pitch, 'step')
  const octave = childNumber(pitch, 'octave', 4)
  const midi = midiFromPitch(step, 0, octave)
  if (midi === note.midi) {
    return 'That note is already natural.'
  }
  return withDocument(xml, (document) => {
    const element = findElementByNote(document, note)
    if (!element) {
      return 'Could not find that note in the score.'
    }
    updatePitchElement(element, midi, { step, alter: 0 })
    return {
      xml: serialize(document),
      selection: { ...selection, midi },
    }
  })
}


export function setTimeSignature(
  xml: string,
  measureIndex: number,
  beats: number,
  beatType: number,
): { xml: string } | string {
  if (beats < 1 || beatType < 1) {
    return 'Choose a valid time signature.'
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    return 'The score XML is not valid.'
  }
  const parts = Array.from(document.getElementsByTagName('part'))
  if (parts.length === 0) {
    return 'This score has no parts to edit.'
  }
  for (const part of parts) {
    const measures = Array.from(part.children).filter(
      (element) => element.tagName === 'measure',
    )
    const measure = measures[measureIndex]
    if (!measure) {
      continue
    }
    let attributes = Array.from(measure.children).find(
      (element) => element.tagName === 'attributes',
    )
    if (!attributes) {
      attributes = document.createElement('attributes')
      measure.insertBefore(attributes, measure.firstChild)
    }
    Array.from(components(attributes, 'time')).forEach((time) => time.remove())
    const time = document.createElement('time')
    const beatsElement = document.createElement('beats')
    beatsElement.textContent = String(beats)
    const beatTypeElement = document.createElement('beat-type')
    beatTypeElement.textContent = String(beatType)
    time.appendChild(beatsElement)
    time.appendChild(beatTypeElement)
    attributes.appendChild(time)
  }
  return { xml: serialize(document) }
}

function components(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.tagName === name)
}
