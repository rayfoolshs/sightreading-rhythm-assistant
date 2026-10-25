import { describe, expect, it } from 'vitest'
import {
  deleteNote,
  keyFifthsFromXml,
  findEditableNote,
  naturalizeNote,
  noteNameFromMidi,
  parseEditableNotes,
  setNoteDuration,
  setTimeSignature,
  toggleRest,
  transposeNote,
  validateMusicXml,
  type EditResult,
} from './musicxmlEditor'
import type { NoteSelection } from './types'

function score(inner: string, parts = 1): string {
  const partList = Array.from(
    { length: parts },
    (_, index) =>
      `<score-part id="P${index + 1}"><part-name>Part ${index + 1}</part-name></score-part>`,
  ).join('')
  const partXml = Array.from(
    { length: parts },
    (_, index) =>
      `<part id="P${index + 1}"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${inner}</measure></part>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>${partList}</part-list>
  ${partXml}
</score-partwise>`
}

const flatNote =
  '<note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>'
const dNote =
  '<note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>'
const halfRest =
  '<note><rest/><duration>8</duration><voice>1</voice><type>half</type></note>'

const flatScore = score(`${flatNote}${dNote}${halfRest}`)

function expectEdit(result: EditResult | string): EditResult {
  if (typeof result === 'string') {
    throw new Error(result)
  }
  return result
}

function firstPitch(xml: string): {
  step: string
  alter: string | null
  octave: string
} {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const pitch = document.getElementsByTagName('pitch')[0]
  return {
    step: pitch.getElementsByTagName('step')[0].textContent ?? '',
    alter: pitch.getElementsByTagName('alter')[0]?.textContent ?? null,
    octave: pitch.getElementsByTagName('octave')[0].textContent ?? '',
  }
}

const flatSelection: NoteSelection = {
  measureIndex: 0,
  onsetQ: 0,
  midi: 70,
}

describe('parseEditableNotes', () => {
  it('reads onsets, durations and pitches', () => {
    const notes = parseEditableNotes(flatScore)
    expect(notes).toHaveLength(3)
    expect(notes.map((note) => note.onsetQ)).toEqual([0, 1, 2])
    expect(notes.map((note) => note.durationQ)).toEqual([1, 1, 2])
    expect(notes.map((note) => note.midi)).toEqual([70, 62, null])
    expect(notes[2].isRest).toBe(true)
  })

  it('keeps chord notes at the same onset', () => {
    const chord = score(
      `${dNote}<note><chord/><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note><note><rest/><duration>8</duration><voice>1</voice><type>half</type></note>`,
    )
    const notes = parseEditableNotes(chord)
    expect(notes[0].onsetQ).toBe(0)
    expect(notes[1].onsetQ).toBe(0)
    expect(notes[1].isChord).toBe(true)
    expect(notes[2].onsetQ).toBe(1)
  })

  it('returns nothing for invalid XML', () => {
    expect(parseEditableNotes('<not-xml')).toEqual([])
  })
})

describe('findEditableNote', () => {
  it('matches by measure, onset and pitch', () => {
    const notes = parseEditableNotes(flatScore)
    expect(findEditableNote(notes, flatSelection)?.midi).toBe(70)
    expect(
      findEditableNote(notes, { ...flatSelection, onsetQ: 2, midi: null })
        ?.isRest,
    ).toBe(true)
  })

  it('falls back to the nearest pitch at that onset', () => {
    const notes = parseEditableNotes(flatScore)
    expect(findEditableNote(notes, { ...flatSelection, midi: 71 })?.midi).toBe(
      70,
    )
  })
})

describe('transposeNote', () => {
  it('keeps flats when moving by an octave', () => {
    const result = expectEdit(transposeNote(flatScore, flatSelection, 12))
    expect(firstPitch(result.xml)).toEqual({
      step: 'B',
      alter: '-1',
      octave: '5',
    })
    expect(result.selection.midi).toBe(82)
  })

  it('keeps flats when moving down an octave', () => {
    const result = expectEdit(transposeNote(flatScore, flatSelection, -12))
    expect(firstPitch(result.xml)).toEqual({
      step: 'B',
      alter: '-1',
      octave: '3',
    })
  })

  it('raises a flat to a natural instead of an enharmonic sharp', () => {
    const result = expectEdit(transposeNote(flatScore, flatSelection, 1))
    expect(firstPitch(result.xml)).toEqual({
      step: 'B',
      alter: null,
      octave: '4',
    })
    expect(result.selection.midi).toBe(71)
  })

  it('lowers a flat onto the previous letter', () => {
    const result = expectEdit(transposeNote(flatScore, flatSelection, -1))
    expect(firstPitch(result.xml)).toEqual({
      step: 'A',
      alter: null,
      octave: '4',
    })
  })

  it('spills a sharp onto the next letter when raised again', () => {
    const sharpScore = score(
      '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>' +
        dNote +
        halfRest,
    )
    const result = expectEdit(
      transposeNote(
        sharpScore,
        { measureIndex: 0, onsetQ: 0, midi: 66 },
        1,
      ),
    )
    expect(firstPitch(result.xml)).toEqual({
      step: 'G',
      alter: null,
      octave: '4',
    })
  })

  it('refuses to transpose a rest', () => {
    const result = transposeNote(flatScore, { ...flatSelection, midi: null }, 1)
    expect(typeof result).toBe('string')
  })

  it('uses the key signature for wider intervals', () => {
    const flatKeyScore = flatScore.replace(
      '<fifths>0</fifths>',
      '<fifths>-3</fifths>',
    )
    const flatResult = expectEdit(
      transposeNote(flatKeyScore, flatSelection, 3),
    )
    expect(firstPitch(flatResult.xml)).toEqual({
      step: 'D',
      alter: '-1',
      octave: '5',
    })

    const sharpResult = expectEdit(transposeNote(flatScore, flatSelection, 3))
    expect(firstPitch(sharpResult.xml)).toEqual({
      step: 'C',
      alter: '1',
      octave: '5',
    })
  })
})

describe('naturalizeNote', () => {
  it('writes the natural on the same letter', () => {
    const sharpScore = score(
      '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>' +
        dNote +
        halfRest,
    )
    const result = expectEdit(
      naturalizeNote(sharpScore, {
        measureIndex: 0,
        onsetQ: 0,
        midi: 66,
      }),
    )
    expect(firstPitch(result.xml)).toEqual({
      step: 'F',
      alter: null,
      octave: '4',
    })
    expect(result.selection.midi).toBe(65)
  })
})

describe('setNoteDuration', () => {
  it('shortens the next note so the bar still adds up', () => {
    const result = expectEdit(setNoteDuration(flatScore, flatSelection, 0.5))
    const notes = parseEditableNotes(result.xml)
    expect(notes[0].durationQ).toBe(0.5)
    expect(notes[1].durationQ).toBe(1.5)
    expect(notes[1].type).toBe('quarter')
    expect(notes[1].dots).toBe(1)
  })

  it('refuses to resize the last note in a bar', () => {
    const single = score(dNote)
    const result = setNoteDuration(
      single,
      { measureIndex: 0, onsetQ: 0, midi: 62 },
      2,
    )
    expect(typeof result).toBe('string')
  })

  it('rejects unsupported values', () => {
    expect(
      typeof setNoteDuration(flatScore, flatSelection, 0.3333),
    ).toBe('string')
  })
})

describe('toggleRest', () => {
  it('turns a note into a rest and back', () => {
    const asRest = expectEdit(toggleRest(flatScore, flatSelection))
    expect(asRest.selection.midi).toBeNull()
    expect(
      parseEditableNotes(asRest.xml).find(
        (note) => note.measureIndex === 0 && note.onsetQ === 0,
      )?.isRest,
    ).toBe(true)

    const asNote = expectEdit(toggleRest(asRest.xml, asRest.selection))
    expect(asNote.selection.midi).toBe(60)
    expect(firstPitch(asNote.xml)).toEqual({
      step: 'C',
      alter: null,
      octave: '4',
    })
  })
})

describe('deleteNote', () => {
  const chordScore = score(
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>' +
      '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>' +
      '<note><rest/><duration>12</duration><voice>1</voice><type>half</type><dot/></note>',
  )

  it('turns a standalone note into a rest', () => {
    const result = expectEdit(deleteNote(flatScore, flatSelection))
    expect(result.selection.midi).toBeNull()
    expect(
      parseEditableNotes(result.xml).find(
        (note) => note.measureIndex === 0 && note.onsetQ === 0,
      )?.isRest,
    ).toBe(true)
  })

  it('removes a chord member and keeps the rest of the chord', () => {
    const result = expectEdit(
      deleteNote(chordScore, { measureIndex: 0, onsetQ: 0, midi: 64 }),
    )
    const notes = parseEditableNotes(result.xml)
    const chord = notes.filter(
      (note) => note.measureIndex === 0 && note.onsetQ === 0 && !note.isRest,
    )
    expect(chord).toHaveLength(1)
    expect(chord[0].midi).toBe(60)
    expect(
      new DOMParser()
        .parseFromString(result.xml, 'application/xml')
        .getElementsByTagName('chord'),
    ).toHaveLength(0)
    expect(result.selection.midi).toBe(60)
  })

  it('promotes the next member when the base note is deleted', () => {
    const result = expectEdit(
      deleteNote(chordScore, { measureIndex: 0, onsetQ: 0, midi: 60 }),
    )
    const document = new DOMParser().parseFromString(
      result.xml,
      'application/xml',
    )
    expect(document.getElementsByTagName('chord')).toHaveLength(0)
    const chord = parseEditableNotes(result.xml).filter(
      (note) => note.measureIndex === 0 && note.onsetQ === 0 && !note.isRest,
    )
    expect(chord).toHaveLength(1)
    expect(chord[0].midi).toBe(64)
    expect(chord[0].onsetQ).toBe(0)
    expect(chord[0].durationQ).toBe(1)
  })

  it('leaves a rest when every chord member is deleted', () => {
    const first = expectEdit(
      deleteNote(chordScore, { measureIndex: 0, onsetQ: 0, midi: 60 }),
    )
    const second = expectEdit(
      deleteNote(first.xml, { measureIndex: 0, onsetQ: 0, midi: 64 }),
    )
    const atOnset = parseEditableNotes(second.xml).filter(
      (note) => note.measureIndex === 0 && note.onsetQ === 0,
    )
    expect(atOnset).toHaveLength(1)
    expect(atOnset[0].isRest).toBe(true)
    expect(atOnset[0].durationQ).toBe(1)
  })

  it('deletes every segment of a tied note', () => {
    const tiedScore = score(
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><tie type="start"/></note>' +
        '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><tie type="stop"/></note>' +
        '<note><rest/><duration>8</duration><voice>1</voice><type>half</type></note>',
    )
    const result = expectEdit(
      deleteNote(tiedScore, { measureIndex: 0, onsetQ: 0, midi: 60 }),
    )
    const segments = parseEditableNotes(result.xml).filter(
      (note) => note.onsetQ < 2,
    )
    expect(segments).toHaveLength(2)
    expect(segments.every((note) => note.isRest)).toBe(true)
    expect(segments.map((note) => note.onsetQ)).toEqual([0, 1])
  })

  it('refuses to delete a rest', () => {
    const result = deleteNote(flatScore, {
      measureIndex: 0,
      onsetQ: 2,
      midi: null,
    })
    expect(typeof result).toBe('string')
    expect(result).toContain('already a rest')
  })

  it('reports a selection that cannot be matched', () => {
    const result = deleteNote(flatScore, {
      measureIndex: 0,
      onsetQ: 3.5,
      midi: 60,
    })
    expect(typeof result).toBe('string')
    expect(result).toContain('Could not match')
  })
})

describe('setTimeSignature', () => {
  it('replaces the time element in each part', () => {
    const result = setTimeSignature(score(dNote, 2), 0, 3, 4)
    const xml = typeof result === 'string' ? '' : result.xml
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const beats = Array.from(document.getElementsByTagName('beats'))
    const beatTypes = Array.from(document.getElementsByTagName('beat-type'))
    expect(beats).toHaveLength(2)
    expect(beats.every((element) => element.textContent === '3')).toBe(true)
    expect(beatTypes.every((element) => element.textContent === '4')).toBe(true)
    expect(document.getElementsByTagName('time')).toHaveLength(2)
  })

  it('creates attributes when the measure has none', () => {
    const bare = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1">${dNote}<note><rest/><duration>12</duration><voice>1</voice><type>half</type><dot/></note></measure></part></score-partwise>`
    const result = setTimeSignature(bare, 0, 6, 8)
    const xml = typeof result === 'string' ? '' : result.xml
    expect(xml).toContain('<attributes>')
    expect(xml).toContain('<beats>6</beats>')
  })
})

describe('validateMusicXml', () => {
  it('accepts score-partwise documents', () => {
    expect(validateMusicXml(flatScore)).toBeNull()
  })

  it('rejects broken XML', () => {
    expect(validateMusicXml('<score-partwise>')).toContain('not valid XML')
  })

  it('rejects unrelated XML', () => {
    expect(validateMusicXml('<root/>')).toContain('MusicXML')
  })
})

describe('helpers', () => {
  it('names notes', () => {
    expect(noteNameFromMidi(60)).toBe('C4')
    expect(noteNameFromMidi(70)).toBe('A♯4')
    expect(noteNameFromMidi(70, { step: 'B', alter: -1 })).toBe('B♭4')
  })

  it('reads the key signature', () => {
    expect(keyFifthsFromXml(flatScore)).toBe(0)
    expect(
      keyFifthsFromXml(
        flatScore.replace('<fifths>0</fifths>', '<fifths>-4</fifths>'),
      ),
    ).toBe(-4)
    expect(keyFifthsFromXml('<root/>')).toBe(0)
  })
})
