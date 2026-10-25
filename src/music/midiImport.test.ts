import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { midiToMusicXml } from './midiImport'

interface RawEvent {
  deltaTime: number
  meta?: boolean
  type: string
  text?: string
  channel?: number
  noteNumber?: number
  velocity?: number
  key?: number
  scale?: number
}

const require = createRequire(import.meta.url)
const { writeMidi } = require('midi-file') as {
  writeMidi: (data: unknown) => Uint8Array
}

function noteTrack(
  name: string,
  notes: Array<[midi: number, startTick: number, durationTicks: number]>,
): RawEvent[] {
  const events: RawEvent[] = [
    { deltaTime: 0, meta: true, type: 'trackName', text: name },
  ]
  let cursor = 0
  for (const [midi, start, duration] of [...notes].sort(
    (a, b) => a[1] - b[1],
  )) {
    events.push({
      deltaTime: start - cursor,
      type: 'noteOn',
      channel: 0,
      noteNumber: midi,
      velocity: 90,
    })
    events.push({
      deltaTime: duration,
      type: 'noteOff',
      channel: 0,
      noteNumber: midi,
      velocity: 0,
    })
    cursor = start + duration
  }
  events.push({ deltaTime: 0, meta: true, type: 'endOfTrack' })
  return events
}

function midiBuffer(
  tracks: RawEvent[][],
  key?: number,
): ArrayBuffer {
  const keySignature: RawEvent[] =
    key === undefined
      ? []
      : [{ deltaTime: 0, meta: true, type: 'keySignature', key, scale: 0 }]
  const data = {
    header: { format: 1, numTracks: tracks.length, ticksPerBeat: 480 },
    tracks: tracks.map((track) => [...keySignature, ...track]),
  }
  const bytes = writeMidi(data)
  const array =
    bytes instanceof Uint8Array
      ? bytes
      : Uint8Array.from(bytes as unknown as number[])
  return array.buffer.slice(
    array.byteOffset,
    array.byteOffset + array.byteLength,
  ) as ArrayBuffer
}

describe('midiToMusicXml', () => {
  it('writes a pitched track as a MusicXML part', () => {
    const result = midiToMusicXml(
      midiBuffer([noteTrack('Melody', [[60, 0, 480]])]),
      'fallback',
    )
    expect(result.partCount).toBe(1)
    expect(result.title).toBe('Melody')
    expect(result.xml).toContain('<divisions>8</divisions>')
    expect(result.xml).toContain('<beats>4</beats>')
    expect(result.xml).toContain('<step>C</step><octave>4</octave>')
    expect(result.xml).toContain('<duration>8</duration>')
    expect(result.xml).toContain('<part-name>Melody</part-name>')
  })

  it('spells pitches according to the key signature', () => {
    const result = midiToMusicXml(
      midiBuffer([noteTrack('Melody', [[70, 0, 480]])], -2),
      'fallback',
    )
    expect(result.xml).toContain(
      '<step>B</step><alter>-1</alter><octave>4</octave>',
    )
  })

  it('spells with sharps in sharp keys', () => {
    const result = midiToMusicXml(
      midiBuffer([noteTrack('Melody', [[70, 0, 480]])], 2),
      'fallback',
    )
    expect(result.xml).toContain(
      '<step>A</step><alter>1</alter><octave>4</octave>',
    )
  })

  it('splits a wide piano track into upper and lower parts', () => {
    const result = midiToMusicXml(
      midiBuffer([noteTrack('Piano', [[48, 0, 480], [72, 480, 480]])]),
      'fallback',
    )
    expect(result.partCount).toBe(2)
    expect(result.xml).toContain('Piano · upper')
    expect(result.xml).toContain('Piano · lower')
    expect(result.xml).toContain('<sign>F</sign>')
    expect(result.xml).toContain('<sign>G</sign>')
  })

  it('quantizes to the sixteenth grid', () => {
    const result = midiToMusicXml(
      midiBuffer([noteTrack('Melody', [[60, 0, 240]])]),
      'fallback',
    )
    expect(result.xml).toContain('<duration>4</duration>')
    expect(result.xml).toContain('<type>eighth</type>')
  })

  it('rejects a file with no pitched notes', () => {
    expect(() =>
      midiToMusicXml(midiBuffer([noteTrack('Empty', [])]), 'fallback'),
    ).toThrow(/No playable pitched notes/)
  })

  it('rejects data that is not MIDI', () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(() =>
      midiToMusicXml(garbage.buffer as ArrayBuffer, 'fallback'),
    ).toThrow(/could not be read/)
  })
})
