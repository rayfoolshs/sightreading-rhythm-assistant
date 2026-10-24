# Sightreading Rhythm Assistant

Photograph a short piece of sheet music and practise it with a moving playhead, a
metronome, a tempo slider, and a counting label on every note.

The app reads a photo with **Audiveris** (optical music recognition), engraves the
result with **OpenSheetMusicDisplay**, and plays it back with the Web Audio API.

## Live demo

<https://rayfoolshs.github.io/sightreading-rhythm-assistant/>

The Pages build supports the built-in examples, MusicXML uploads, playback, the
Kodály/counting toggles and the editor. **Photo/PDF OMR needs the local Python +
Docker backend**; the hosted build shows an in-app note explaining that.

See [BUILD_PLAN.md](BUILD_PLAN.md) for status, release checks, and post-1.0 work.

## What it does

- **Photo to score** — upload JPG/PNG/HEIC/WebP/TIFF/PDF or drag it onto the page.
- **MIDI import** — import `.mid`/`.midi` files; tracks become parts/staves,
  wide piano tracks are split into upper/lower staves, and timing is quantized
  to a 16th-note grid.
- **Scrolling playhead** — a coral line glides through the notation and the score
  auto-scrolls to follow it.
- **Metronome** — accented clicks on the first beat (and on the dotted-quarter
  pulse in 6/8, 9/8, 12/8).
- **Tempo slider** — 40–200 BPM, adjustable while playing.
- **Counting labels** — each note onset is labelled with its count (`1`, `2 &`,
  `3 e`, …), and a large count card shows the current beat. Toggle **Kodály** in
  the score toolbar to replace the numbers with Kodály rhythm syllables (`ta`,
  `ti`, `ka`, `ta-a`, `ta-i`, …).
- **Practice controls** — loop, sound volume/mute, restart, keyboard shortcuts.
- **Score editor** — a flat.io-style notation palette for fixing OMR mistakes or
  writing from scratch: note values, dotted notes, a rest palette, accidentals,
  octaves, and time signatures. Undo/redo and a raw MusicXML editor are included.
- **Blank staff** — start an empty staff and click anywhere on it to write your
  own notes, then change the meter from the same palette.
- **No photo?** The default example is a flute + piano Prelude in G Harmonic
  Minor; two more samples demonstrate 4/4 and 6/8 counting.
- **Per-staff counting** — multi-staff scores get separate counting rows and
  S1/S2/S3 toggles, so you can hide the counting for any staff.

## Quick start

Requirements: Node 20+, Python 3.9+, and Docker (Docker Desktop or
[Colima](https://github.com/abiosoft/colima)) for the photo recognition.
You can also point the server at a native Audiveris install (see Configuration).

```bash
npm install
npm run server:setup      # creates .venv and installs FastAPI + Pillow

# Make sure Docker is running. On macOS with Colima:
colima start

# Terminal 1 — OMR API on http://127.0.0.1:8000
npm run server

# Terminal 2 — web app on http://localhost:5173
npm run dev
```

Open <http://localhost:5173>. The first photo upload pulls the
`toprock/audiveris:stable` image (about 1 GB, once) and can take ~40–60 seconds.
Later conversions are faster.

To run the production build from the Python server instead:

```bash
npm run build
npm run server
# open http://127.0.0.1:8000
```

## Using it

1. Pick a sample, or upload a photo/PDF of **one short piece**.
2. Press **Play** (or <kbd>Space</kbd>). The metronome is on by default.
3. Follow the coral line and the count bubbles under the notes. The big card shows
   the current count (e.g. `2 &`) and the active beat.
4. Start slow, then nudge the tempo slider up.
5. Toggle **Kodály** above the score to switch the under-note labels from numbers
   to Kodály rhythm syllables.

### Importing MIDI

Choose or drop a `.mid`/`.midi` file. Each pitched track becomes a part/staff
(drum tracks are skipped). A wide single track is split into upper and lower
staves. Notes are quantized to 16th notes; very complex timing/triplets may need
cleanup in the editor or a MusicXML export from MuseScore.

Shortcuts: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> nudge one
quarter note · <kbd>Home</kbd> restart. In the editor, <kbd>Delete</kbd> or <kbd>⌫</kbd> removes
the selected note or range.

### Editing and writing notes

- **Fix an existing score:** click **Edit score**, click a notehead or rest, then
  use the notation palette on the left. The Notes section sets note values and
  dots; the Rests section below it converts notes to rests or sets rest values.
  Accidentals and octave controls are in the same rail.
- **Select a range:** click one note, then Shift-click another. Every note between
  them is highlighted. Press <kbd>Delete</kbd> or <kbd>⌫</kbd> to turn the range into equivalent
  rests.
- **Audition and move notes:** press <kbd>←</kbd>/<kbd>→</kbd> to step through the
  notes and hear each one. <kbd>↑</kbd>/<kbd>↓</kbd> raises or lowers the selected
  note by a semitone (and plays it). Hold <kbd>Shift</kbd> with <kbd>←</kbd>/<kbd>→</kbd>
  to move the note rhythmically, or <kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> for
  octaves. Moving in time works on the blank staff; use the MusicXML panel for
  other scores.
- **Write from scratch:** choose **Blank staff** in the load panel, or click
  **Clear staff** while editing. Click anywhere on the staff to place a note at
  that pitch and beat, or type a note letter (<kbd>A</kbd>–<kbd>G</kbd>) to write
  at the moving green cursor. <kbd>Z</kbd>/<kbd>X</kbd> changes the input octave,
  <kbd>1</kbd>–<kbd>5</kbd> selects whole/half/quarter/eighth/sixteenth, and
  <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>5</kbd> enters the equivalent rest.
- **Change the meter:** use the **Meter** selector in the palette. On a blank
  staff it applies to the whole staff; on an existing score it applies from the
  selected bar onward (and is blocked if the bar's notes would overflow).
- **Undo/Redo/Revert:** each edit is undoable. **MusicXML** opens the raw source
  for chords, unusual rhythms, or anything the palette cannot express.
- Click **Done** to leave edit mode.

Changing a note value automatically adjusts the following note so the bar still
adds up. Deleting a note turns it into a rest of the same value, so the timing
stays intact. Chords and resizing the last note in a measure need the MusicXML
editor.

### Photo tips for better recognition

- One page, one piece, filling the frame, shot straight-on.
- Bright, even light; no shadows across the staff.
- Avoid handwritten music — Audiveris works best with printed notation.
- Keep the image under 25 MB. iPhone HEIC photos are supported.

## How it works

```
photo/PDF ──► FastAPI /api/omr
                 │  (Pillow: EXIF fix, resize, embed as PDF)
                 ▼
          Docker: toprock/audiveris
                 │  PDF → MusicXML (.mxl)
                 ▼
          frontend OSMD render
                 │
                 ├─ cursor walk → note timeline, positions, count labels
                 ├─ Web Audio scheduler → piano tones + metronome
                 └─ requestAnimationFrame → playhead + auto-scroll + count card
```

The browser walks OSMD's cursor once after rendering to build a timeline of
note onsets, pitches, durations, and on-screen positions. Counting labels are
derived from the note's position inside the measure and the time signature:
quarter/eighth/sixteenth subdivisions use `1 e & a`, while compound meters
(6/8, 9/8, 12/8) count the eighth-note pulses and accent every third pulse.

## Project layout

```
src/
  App.tsx                 app state, loading, keyboard shortcuts
  components/
    ScoreView.tsx         OSMD render, labels, playhead, auto-scroll
    CountDisplay.tsx      big current-count card
    Controls.tsx          transport, tempo, metronome, loop, volume
    LoadPanel.tsx         upload/dropzone, samples, OMR status
    EditorPanel.tsx       selected-note inspector and editor hints
    NotationPalette.tsx   flat.io-style note/rest/accidental palette
  music/
    analyze.ts            OSMD cursor walk → timeline + label positions
    counting.ts           count labels, beat grids, position description
    musicxmlEditor.ts     MusicXML note lookup, pitch/duration/rest edits
    blankScore.ts         empty-staff generation + click-to-write notes
    pieces/prelude.musicxml  default flute + piano example
    player.ts             lookahead scheduler, loop/seek/tempo handling
    audio.ts              Web Audio piano-ish synth + metronome clicks
    demo.ts               built-in MusicXML samples
    types.ts              shared types
server/
  main.py                 FastAPI OMR endpoint + optional static hosting
  requirements.txt
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUDIVERIS_BIN` | unset | Path to a native `audiveris` CLI. When set, Docker is not used. |
| `AUDIVERIS_DOCKER_IMAGE` | `toprock/audiveris:stable` | Docker image used for OMR. |
| `OMR_WORK_DIR` | `<project>/.omr-work` | Scratch directory; must be inside a folder Docker can mount. |

`GET /api/health` reports whether the OMR backend is ready.

## Limitations

- OMR is hard: dense, handwritten, skewed, or low-resolution pages will produce
  mistakes. Use the editor to fix individual notes; chords and a few rhythm
  cases still need the raw MusicXML editor.
- The blank staff is a single treble staff. Click/type-to-write notes are
  monophonic; use MusicXML for chords or multiple staves.
- Keyboard note entry and free time-movement of notes are available on the blank
  staff. On recognised scores you can still change pitch/accidentals and delete
  notes, but rhythmic moves need the MusicXML panel.
- On an existing score, changing the meter is blocked if notes in the target bar
  would no longer fit. Blank-staff meter changes regenerate the page and may
  remove notes that do not fit the new bar length.
- Repeats and jumps are ignored when building the playback timeline.
- Compressed `.mxl` uploads are not accepted directly (photo/PDF and uncompressed
  `.musicxml`/`.xml` are). OMR results are decompressed server-side.
- The synth is a simple oscillator instrument, not a sampled piano.
- Designed for short pieces on one page, as the name suggests.

Natural next steps: chord input, multiple staves/clefs, drag/delete gestures,
PDF multi-page queue, repeat/D.C. support, count-in bar, section looping, and
saved practice history.

## Troubleshooting

**“Could not reach the OMR server.”** Start it with `npm run server`; make sure
port 8000 is free.

**“Docker is not responding.”** Start Docker Desktop or run `colima start`, then
retry. Check with `docker info`.

**Recognition returns no music.** Re-shoot straight-on with the page filling the
frame, or try the exported MusicXML route.

**Docker mounts an empty folder.** On macOS, Colima only shares some paths. The
scratch folder defaults to `<project>/.omr-work` to stay inside the shared
workspace; keep it under your home directory (or set `OMR_WORK_DIR`).

## Credits

Created by Ray Foo — [www.rayfooproductions.com](https://www.rayfooproductions.com).
