# Build Prompt — Sightreading Rhythm Assistant

Build a local-first web app called **Sightreading Rhythm Assistant**. It turns a
photo/PDF of a short piece of sheet music into an interactive practice session
with a moving playhead, a metronome, a tempo slider, per-note counting labels,
and an optional shuffle feel.

Do not ask clarifying questions. Make reasonable choices and deliver a working
app matching the acceptance tests at the end.

---

## Product summary

A student can:

1. Upload a photo, PDF, MusicXML file, or choose a built-in sample.
2. See the music engraved as real notation.
3. Press Play and follow a moving playhead while a metronome clicks.
4. Change tempo from 40 to 200 BPM, loop, pause, seek, and mute.
5. Count along using labels printed beneath each note.
6. Turn on a shuffle/swing feel and adjust it with a slider.

The app must also work end-to-end from a photo using local optical music
recognition (OMR), with no paid API keys.

---

## Tech stack

- **Frontend**: React 19 + TypeScript + Vite.
- **Notation**: `opensheetmusicdisplay` (OSMD 2.x) with the SVG backend.
- **Audio**: native Web Audio API, writing our own lookahead scheduler. Do not
  use a playback library.
- **Backend**: Python 3.9+ FastAPI + Uvicorn.
- **Images**: Pillow + pillow-heif (HEIC support).
- **OMR**: Audiveris inside Docker (`toprock/audiveris:stable`) by default,
  with an optional native `AUDIVERIS_BIN` override.
- **Styling**: plain CSS with custom properties. No UI framework.

### Commands / setup

```bash
npm install
npm run server:setup    # python3 -m venv .venv && pip install -r server/requirements.txt
colima start            # or Docker Desktop
npm run server          # FastAPI on 127.0.0.1:8000
npm run dev             # Vite on localhost:5173
npm run build           # tsc -b && vite build
npm run lint
```

The production build must also be servable by the Python server at
`http://127.0.0.1:8000/` when `dist/` exists.

---

## 1. Loading pieces

Provide:

- A dashed-border dropzone accepting drag/drop or file picker:
  `image/*`, `application/pdf`, `.xml`, `.musicxml`.
- Two built-in sample pieces (inline MusicXML strings):
  1. **Counting Warm-Up** — 4/4, 8 bars, quarters, eighths, sixteenths,
     dotted rhythm, half and whole notes, tempo 84.
  2. **Compound Time Etude** — 6/8, 8 bars, eighth/quarter/dotted-quarter
     rhythms, tempo 104.
- MusicXML uploads use the internal `<work-title>`/`<movement-title>` as the
  displayed piece name, falling back to the filename.
- Photo/PDF uploads go to `POST /api/omr` and show a busy state with rotating
  messages: “Uploading your sheet music…” then “Reading notation with
  Audiveris — this can take a minute.”
- `.mxl` direct uploads are not supported in the browser (show a clear message);
  OMR-generated `.mxl` files are decompressed on the server.

---

## 2. OMR backend

Implement `server/main.py` with FastAPI.

### Endpoints

- `GET /api/health` → `{ ready, audiverisBinary, docker, dockerImage, hint }`.
  Check Docker with `docker info --format "{{.ServerVersion}}"` (short timeout).
- `POST /api/omr` → `{ musicxml: string, title: string }`.

### OMR pipeline

1. Accept JPG, PNG, HEIC/HEIF, WebP, BMP, TIFF, or PDF, max 25 MB.
2. Save the upload to a scratch directory under the **project workspace**, not
   `/tmp`, because Docker on macOS/Colima may not share `/tmp`.
   Default: `<project>/.omr-work`, overridable with `OMR_WORK_DIR`.
3. **Recreate `.omr-work` on every request** with
   `mkdir(parents=True, exist_ok=True)`. Do not assume it still exists.
4. Convert images to PDF with Pillow: honor EXIF orientation, convert to RGB,
   downscale the longest side to at most 2600 px, save at 300 DPI.
5. Run Audiveris:
   - Docker (default): image writes results to a mounted `/output`.
     Mount scratch `input/` and `output/` folders and run the image with no
     extra CLI arguments for the `toprock/audiveris:stable` image.
   - Native: `AUDIVERIS_BIN -batch -export -output <outdir> <pdf>`.
6. Find the newest `.mxl`, `.musicxml`, or `.xml` output. Decompress `.mxl`
   via `META-INF/container.xml` or the first XML entry.
7. Extract the title from the MusicXML.
8. Clean up the scratch folder in `finally`.
9. Serialize OMR jobs with a non-blocking lock; return **429** if another job is
   running.
10. Return useful JSON errors (`detail`) for unsupported files, oversized
    files, Docker unavailable, timeouts, unreadable images, and “no music found”.
    Add a global exception handler so unexpected failures return JSON, not a raw
    500 body.

### Docker notes

- Audiveris is an x86 image; on Apple Silicon it runs under emulation and may
  take ~40–60 seconds for the first page.
- The first request pulls roughly 1 GB.
- Do not mount `/tmp`; the Docker VM may see it as empty.

---

## 3. Score rendering

Use OSMD with:

```ts
{
  backend: 'svg',
  autoResize: false,
  drawTitle: true,
  drawSubtitle: true,
  drawComposer: false,
  drawCredits: false,
  drawPartNames: false,
  drawMeasureNumbers: true,
  drawMeasureNumbersOnlyAtSystemStart: true,
  autoBeam: true,
  autoBeamOptions: {
    beam_rests: false,
    beam_middle_rests_only: true,
    groups: /* computed from the first time signature */
  },
  followCursor: false,
  pageFormat: 'Endless',
  renderSingleHorizontalStaffline: false
}
```

Set `osmd.Zoom = 0.86` and `osmd.FollowCursor = false`.

### Beaming requirements

Beams must be connected and grouped correctly:

- 4/4 eighth notes: beam in pairs within each beat.
- 4/4 sixteenths: beam all notes within a beat with double beams.
- 6/8: beam eighth notes in groups of three (dotted-quarter beats).
- Other simple meters: group by the beat unit derived from the denominator.
- 9/8 and 12/8: groups of three eighths.

For the **built-in demos**, write explicit `<beam number="1">begin/continue/end</beam>`
tags (and `number="2"` for sixteenths) into the MusicXML. This guarantees exact
groupings independent of auto-beaming.

For imported scores, OSMD auto-beaming is the fallback. Parse the first
`<time>` from the XML before constructing OSMD and pass beat-based
`autoBeamOptions.groups` in the constructor:

- `[[1,4],[1,4],[1,4],[1,4]]` for 4/4.
- `[[3,8],[3,8]]` for 6/8.
- Three groups of 3/8 for 9/8; four for 12/8.
- `[[3,8]]` for 3/8.

Note: `groups` is typed oddly by OSMD; cast to `[number[]] | undefined` if
necessary.

---

## 4. Score analysis / timeline

After `await osmd.load(xml)` and `osmd.render()`, walk OSMD’s cursor once to
build a score model.

For each cursor step until `cursor.iterator.EndReached`:

- Read `CurrentSourceTimestamp.RealValue * 4` → onset in quarter notes.
- Read `CurrentMeasureIndex`, `CurrentMeasure.ActiveTimeSignature`,
  `CurrentRelativeInMeasureTimestamp.RealValue * 4`.
- Use `cursor.GNotesUnderCursor()` for notes.
- Record the visual step position, time signature, measure index, onset, and
  whether it contains notes.
- Deduplicate steps with the same onset.
- For backward jumps (repeats/D.C.), skip the repeated section but continue
  collecting later notation. Repeats are intentionally ignored.
- For each sounding note:
  - Skip rests.
  - Skip tied continuations: `source.NoteTie.StartNote !== source`.
  - Duration = `source.Length.RealValue * 4`.
  - Frequency = `source.Pitch.Frequency`.
  - Record `{ q, durQ, frequency, measureIndex, velocity: 0.75 }`.
  - Track the maximum duration for the onset (used by labels).
- Track the **beam group** for each onset via `source.NoteBeam` if available
  (first beamed note wins; optional but useful).
- Track the measure grid: compute the GCD of all onset offsets and durations in
  each measure (in 1/48-quarter ticks). Clamp to `[0.125, pulseUnitQ]`.
  This grid decides which subdivisions are real in that measure.
- Build measures from `osmd.Sheet.SourceMeasures`:
  - cumulative start in quarters;
  - `Duration.RealValue * 4` or fallback time-signature length;
  - time signature;
  - compound flag: denominator 8, numerator > 3, numerator % 3 === 0;
  - `beatUnitQ = compound ? 1.5 : 4 / beatType`.
- Build a metronome beat list:
  - Simple meter: one click per beat (quarter/half/eighth per denominator),
    accent only the first beat.
  - Compound meter: one click per eighth pulse, accent every third pulse
    (1, 4, 7, 10).
- `totalQ` = max of measure end, last onset + 1, and 4.
- Initial BPM: first iterator `CurrentBpm`, fallback 100.
- Title: `osmd.Sheet.TitleString`.

### Coordinate mapping

- 1 OSMD unit = 10 px × zoom.
- For label positions, use the **notehead center**, not the cursor line:
  `(graphicalNote.PositionAndShape.AbsolutePosition.x + Size.width / 2) * 10 * osmd.Zoom`.
- For chords, center between min and max notehead centers.
- Fall back to the cursor rectangle if no graphical notes are available.
- Vertical position starts from `cursorRect` top/height (system bounds).

---

## 5. Counting rules (critical)

### Units and syllables

- `pulseUnitQ(ts) = compound ? 0.5 : 4 / beatType` (in quarter notes).
- Count numbers are based on pulse positions:
  - 4/4 counts 1, 2, 3, 4.
  - 6/8/9/8/12/8 count eighth pulses 1…n.
- Subdivision syllables for a position within a pulse (fraction of the pulse):
  - 0 → beat number only
  - 0.25 → `e`
  - 0.5 → `&`
  - 0.75 → `a`
  - Other / triplet / 32nd positions → `·` (or omit)
- Only allow subdivisions that exist in the measure’s computed grid. A bar of
  quarter notes must not show `e`, `&`, or `a` syllables in its live count.

### Per-note labels under the score

Print a count under **every sounding note onset**, not one label per beam or per
beat.

- Label text:
  - On a beat/pulse: the number, e.g. `1`.
  - On a subdivision with a note also present at that beat start: only the
    syllable, e.g. `&`, `e`, `a`.
  - On a subdivision without a note at the beat start: the full value, e.g.
    `2 &` (so the beat context is not lost).
- Long notes: if the note’s duration is an integer number (≥ 2) of pulse units,
  print all covered pulse numbers under that note:
  - 6/8 quarter → `4 5`
  - 6/8 dotted quarter → `1 2 3`
  - 6/8 dotted half → `1 2 3 4 5 6`
  - 4/4 half → `1 2`; whole → `1 2 3 4`
- Layout:
  - One **single row** below the staff/beams. Do not stagger rows.
  - Horizontal center under the notehead.
  - Vertical offset about **32 px below the system bottom**, so labels clear
    stems and beams that hang below the staff.
  - Use plain text labels (muted green-gray). The currently sounding onset gets
    a coral pill/highlight.
  - Long-value labels use extra word spacing so `4 5` does not read as `45`.
- Deduplicate labels by onset.
- Highlight the last label whose onset is ≤ the current play position.

### Live count card

A large card below the score shows:

- Huge current count, split into number and syllable (`3` + `&`).
- Current measure number / total measures.
- Current BPM.
- A row of beat/pulse chips with the active one highlighted.
- Behavior: use the last note label in the current measure/beat **only if its
  beat number matches the current beat/pulse**; otherwise show the current beat
  number. This keeps the count correct through sustained notes without
  inventing subdivisions that are not in the music.

Examples that must be correct:

- 4/4 Counting Warm-Up bar 4: labels `1`, `&`, `2`, `&`, `3`, `4`.
- 4/4 Counting Warm-Up bar 5: half note label `1 2`; sixteenths `3`, `e`, `&`,
  `a`; quarter `4`.
- 6/8 Compound Time Etude bar 1: `1`, `2`, `3`, `4 5`, `6`.
- 6/8 bar 3: dotted quarters labelled `1 2 3` and `4 5 6`.
- 6/8 bar 8: dotted half labelled `1 2 3 4 5 6`.

---

## 6. Playback

Implement an `AudioEngine` and a `Player` scheduler.

### Audio engine

- Lazily create `AudioContext` on a user gesture (Play click).
- Master gain, separate note and metronome buses.
- Piano-ish synth per note:
  - triangle at the fundamental;
  - sine at 2× frequency (low gain);
  - sine at 0.5× frequency (body);
  - short attack, decay, sustain through duration, 0.35 s release.
- Metronome click: short square-wave tick, high accent on the first beat
  (and every third pulse in compound), lower elsewhere.
- Track active nodes; `stopAll()` on pause/seek/end.
- Volume/mute apply with `setTargetAtTime`.

### Player

- Notes sorted by notated onset; beats precomputed.
- `play()`:
  - resume context;
  - anchor at current position with a ~80 ms start delay;
  - schedule with a 25 ms interval and ~350 ms lookahead (in quarter-note time).
- `pause()`, `toggle()`, `stop()`, `seek(q)`, `setBpm()`, `setLoop()`,
  `setMetronome()`, `setShuffle()`.
- `currentQ()` uses AudioContext time, not wall-clock.
- Position callbacks drive the playhead and count card at requestAnimationFrame
  rate (UI state updates may be throttled to ~70 ms).
- End of piece: loop to 0 if loop is on, otherwise stop and mark ended.
- Pressing Play after the end restarts from 0.
- Tempo changes apply immediately by re-anchoring at the current position.
- Metronome stays on the straight beat grid even when shuffle is on.

### Shuffle / swing

- Add a **Shuffle feel** control in the practice panel:
  - On/Off toggle.
  - Slider from **50 to 75**, default 66, disabled when off.
  - Display `Straight` when off, `66% swing` etc. when on.
  - Scale labels: Straight / Shuffle / Hard.
- Timing warp per quarter-note beat:
  - Let `p` be the position within the beat, `r = amount / 100`.
  - If `p < 0.5`: unchanged.
  - Else map to `r + ((p - 0.5) / 0.5) * (1 - r)`.
- Schedule notes using the warped start and warped end, so the first eighth of
  each pair lengthens and the second shortens.
- Metronome and playhead remain straight; shuffle affects note playback only.
- Do not cut off already-scheduled notes when the slider moves; future notes
  reflect the new amount.

---

## 7. Playhead and auto-scroll

- Hide OSMD’s built-in cursor; draw a custom 3 px coral vertical line with a
  glowing dot.
- Position it horizontally between note onsets (linear interpolation when the
  next step is on the same system; hold at the last note across system breaks).
- Vertical extent follows the current system (`cursor` top/height).
- Auto-scroll the score viewport to keep the playhead visible, with a smooth
  scroll adjustment (~18% per frame) when the line is near the top or bottom.
- Provide an Auto-scroll toggle.
- Score viewport: max-height `min(66vh, 680px)`, vertical scroll, hidden
  horizontal overflow, custom scrollbar.

---

## 8. UI / UX

Layout:

- Warm cream background, white paper score card, deep green practice panels,
  coral active/playhead accent, amber current-beat accent.
- Serif display font for headings and big counts; sans-serif UI.
- Two-column workspace on desktop (`minmax(0,1fr) 362px`), single column under
  1080 px.
- Header: brand mark, “Sightreading Rhythm Assistant”, tagline
  “Photograph it. Count it. Play it.”, current piece name.
- Score column: score card + large count card.
- Side column: Load panel (dropzone, status/error, samples) + Practice panel.
- Practice panel:
  - Play/Pause + Restart.
  - Tempo slider 40–200 with value, −/+ buttons, Slow/Andante/Fast labels.
  - Shuffle feel toggle + slider.
  - Sound slider + mute.
  - Toggle grid: Metronome, Loop, Auto-scroll.
  - Practice tip.
- Footer: OMR/OSMD credits and keyboard hints.
- Mobile: score height ~52vh, count card stacks, side panels stack.

Keyboard:

- Space: play/pause (ignore when focus is in an input/textarea/select).
- ← / →: seek one quarter note.
- Home: restart.

---

## 9. Reliability / edge cases

- StrictMode double-mount must not leave duplicate scores or stale analysis.
- Cancel in-flight OSMD loads when the piece changes.
- Show a loading overlay while engraving.
- If a new score fails to load, keep the old one playable and show an error.
- If OMR fails, keep the old piece and show a dismissible error.
- The server must recreate `.omr-work` every request; never assume it exists.
- OMR errors must be JSON with a useful `detail`.
- The OMR lock must always release in `finally`.
- Do not use `/tmp` for Docker mounts on macOS.
- If Docker is unavailable, return a 503 with instructions to start Docker.
- Ensure the app still works with the pitch/metronome buses at volume 0.
- Avoid autoplay restrictions by creating/resuming AudioContext on the Play
  gesture.

---

## 10. Acceptance tests

1. `npm run build` and `npm run lint` pass.
2. App opens with the Counting Warm-Up demo and counts 1–8 measures.
3. Beaming:
   - 4/4 eighth pairs are connected by beams; sixteenths are connected with
     double beams.
   - 6/8 eighth notes are beamed in groups of three.
4. Labels sit in a single row directly under the noteheads (notehead centers),
   below the beams.
5. Counting Warm-Up bar 4 labels: `1  &  2  &  3  4`.
6. Counting Warm-Up bar 5: half `1 2`; sixteenths `3 e & a`.
7. Compound Time Etude:
   - bar 1: `1 2 3 4 5 6` with `4 5` under the quarter;
   - bar 3: `1 2 3` and `4 5 6`;
   - bar 8: `1 2 3 4 5 6`.
8. Playback: playhead advances, count card updates, metronome clicks, tempo
   slider changes speed live, loop loops, restart works.
9. Shuffle: toggle on, slider moves 50–75, playback applies swung timing to
   off-beat eighths; metronome stays straight.
10. Upload a photo/PDF: busy state appears, OMR returns MusicXML, score renders,
    labels and playback work. Verify `POST /api/omr` returns 200.
11. Upload a `.musicxml` file: internal title appears in the header.
12. Production: `npm run build && npm run server` serves the app at :8000 and
    the API works.

---

## 11. Suggested file structure

```
src/
  App.tsx
  App.css
  index.css
  main.tsx
  components/
    ScoreView.tsx        OSMD load/render, analysis, labels, playhead, scroll
    CountDisplay.tsx     big current-count card
    Controls.tsx         transport, tempo, shuffle, metronome, loop, volume
    LoadPanel.tsx        upload/dropzone, samples, OMR status
  music/
    analyze.ts           cursor walk → timeline, measures, beats, positions
    counting.ts          count labels, beat grids, live position description
    player.ts            lookahead scheduler, seek/loop/tempo/shuffle
    audio.ts             Web Audio synth + metronome
    demo.ts              built-in MusicXML (with explicit beams)
    types.ts             shared types
server/
  main.py                FastAPI OMR endpoint + health + static hosting
  requirements.txt
README.md
```

## 12. Constraints

- No paid APIs or cloud services.
- Keep everything local and runnable on macOS with Docker or a native Audiveris
  install.
- Do not add comments unless necessary.
- Prefer clear, typed modules over monolithic components.
- Keep the score readable at the given zoom; do not hide beams or labels.
