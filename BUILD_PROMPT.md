# Build Prompt — Sightreading Rhythm Assistant

Build a local-first web app called **Sightreading Rhythm Assistant**. It turns a
photo/PDF of a short piece of sheet music into an interactive practice session
with a moving playhead, a metronome, a tempo slider, per-note counting labels,
and an optional shuffle feel.

Do not ask clarifying questions. Make reasonable choices and deliver a working
app matching the acceptance tests at the end.

> **Implementation status:** this is the original build brief, kept for design
> intent. See [BUILD_PLAN.md](BUILD_PLAN.md) for what shipped and current
> limitations. Since v1.1 the implementation added unit tests (`npm test`),
> key-aware flat/sharp spelling, tie-aware playback durations, chord-member and
> tied-note deletion, an error boundary, accessibility fixes, and lazy-loaded
> OSMD/MIDI chunks; the deviations are noted inline below.

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
  - Tie continuations are skipped as steps, but their segment duration is added
    to the event that started the tie, so playback sustains the whole chain.
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

### Kodály syllables

Add a **Kodály** toggle in the score toolbar (both normal and edit mode). When
on, replace the numeric under-note labels with Kodály rhythm syllables; when off,
restore the numbers. Build a separate per-onset label list using `durationQ`:

- whole → `ta-a-a-a`, dotted half → `ta-a-a`, half → `ta-a`
- dotted quarter → `ta-i`, quarter → `ta`
- dotted eighth → `tim`, eighth → `ti`
- sixteenths → alternate `ti` / `ka` by position within the pulse, so four
  sixteenths read `ti ka ti ka`
- label at the same x/y as the numeric labels (under the notehead, below the
  beams), with the same active-note highlighting.

The big live count card can stay numeric. Rebuild the labels when the toggle
changes without reloading OSMD.

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

## 9. Writing your own notes

Add a **Blank staff** option and a click-to-write workflow.

### Blank staff

- Add a **Blank staff** sample/action in the load panel: an empty 8-bar, 4/4
  treble staff.
- Add a **Clear staff** button in edit mode. On a normal score it starts a fresh
  blank page (confirm first); on a blank page it clears the notes but keeps the
  current meter.
- Generate blank MusicXML with `divisions = 8`, one part/staff treble clef, and
  quarter-note rests or written notes.
- **Empty measures must use hidden layout anchors.** OSMD collapses consecutive
  rest-only measures after the second measure. Put `print-object="no"` notes on
  each beat of an otherwise empty measure (e.g. 4 hidden quarter notes in 4/4)
  so every measure gets a real width and position. Hide them visually and:
  - Skip notes with `sourceNote.PrintObject === false` in analysis/audio/note
    heads.
  - Skip `print-object="no"` notes in `parseEditableNotes`.
  - Set `cursor.SkipInvisibleNotes = false` before the analysis cursor walk so
    hidden beats still contribute visual positions.
- Normalize blank MusicXML after every blank-mode edit: re-parse the visible
  notes and regenerate the XML, which re-adds hidden anchors to now-empty
  measures.

### Click to write

- Add an input overlay over the score canvas only in blank-staff edit mode.
  Existing notehead hit targets sit above it and still select notes; rest hit
  targets are hidden in input mode.
- Expose per-measure layout from analysis:
  - measure x/width from OSMD graphical measure bounding boxes;
  - staff top/bottom from `ParentStaffLine.StaffLines` (remember to add the
    measure's absolute y; the line y values are staff-relative);
  - content start X from the first onset step (or a fallback inset).
- On click:
  - Find the measure whose x/y range contains the click.
  - Quantize the horizontal position to a 0.25-quarter grid; clamp to the measure.
  - Map vertical position to treble pitch: bottom staff line = E4, half a staff
    space per diatonic step, using `staffBottomY`/`staffTopY`; clamp the MIDI
    range.
  - Apply the pending duration, dot and accidental; insert only if the range is
    free (reject overlaps with a friendly error).
  - Regenerate the blank XML from the current visible notes plus the new note,
    select the new note, and push an undo snapshot.

### Palette and editor layout

In edit mode, use a focused editor layout: hide the load/practice sidebars and
the big count card; keep a compact transport (Play, Restart, tempo ±, metronome)
in the top toolbar; give the score the full page width. On desktop the notation
palette becomes a sticky left rail (~118 px) with sections in this order:

1. **Notes** — whole, half, quarter, eighth, sixteenth, dot.
2. **Rests** — whole, half, quarter, eighth, sixteenth rest, directly below the
   note values.
3. **Accidentals** — flat / natural / sharp.
4. **Octave** — 8↑ / 8↓.
5. **Meter** — the time-signature selector.

The palette should fall back to a horizontal toolbar on tablet/mobile.

Pending input state (duration, dot, rest, accidental, octave) must remain active
even with no note selected. Palette actions:

- Note value on a selected note: change duration. On a selected rest: convert to
  a note and set the duration. With no selection on a blank staff: set the
  pending input value.
- Rest value on a selected note: convert to a rest and try the chosen value. If
  the value would not fit, still make a rest with the original duration and show
  a warning. On a selected rest: change the duration. With no selection: set the
  pending rest value.
- Dot: toggle the selected note's dots or the pending dot state.
- Accidentals: transpose the selected note by a semitone (natural resets the
  spelling) and set the pending accidental.
- Octave: transpose the selected note by ±12 semitones.

### Keyboard input

On a blank staff, maintain a keyboard insertion cursor (measureIndex, startQ)
and show it as a dashed vertical line in the score. Initially at bar 1 beat 1;
advance it after every inserted note/rest. Clicking a note/rest selects it and
also moves the cursor to the end of that event.

- **A–G** — insert that note name at the cursor using the pending octave,
  accidental, duration and dot. Advance the cursor.
- **Z / X** — lower/raise the pending input octave (2–6).
- **1–5** — whole, half, quarter, eighth, sixteenth length for the next note.
- **Shift+1–5** — select the equivalent rest and insert a rest at the cursor,
  advancing it. The rest is a gap; the score generator fills it with a visible
  rest of the correct value.
- **← / →** — step the selection to the previous/next notehead, scroll it into
  view, and audition it through the audio engine.
- **↑ / ↓** — transpose the selected note by a semitone and audition the new
  pitch; Shift = octave.
- **Shift+← / →** — move the selected note rhythmically by one beat. Wrap across
  bar lines; reject overlaps with a clear message. Time movement is supported on
  the blank staff; show the MusicXML hint for existing scores.
- **Delete / Backspace** — delete the selected note/range and replace it with
  an equivalent rest. Mac keyboards send Backspace from the main delete key, so
  support both; prevent page navigation on Backspace.
- **Shift-click** — select the range of noteheads between the anchor and the
  clicked note; highlight all of them. Delete applies to the whole range.

Show an input status panel: current octave, bar/beat, and the shortcut summary.

### Time signature

- Show a **Meter** selector in the palette (2/4, 3/4, 4/4, 5/4, 6/8, 9/8, 12/8,
  2/2, 3/8).
- On a blank staff: apply globally by regenerating the page with the new meter.
  Keep notes that fit; report how many were dropped.
- On an existing score: write a `<time>` element into the selected measure's
  `<attributes>` (or the first measure if nothing is selected). It applies from
  that bar onward. Before applying, reject the change if existing notes in that
  bar occupy more beats than the new meter, with a clear error message.
- Preserve the selection after an existing-score meter change so the selector
  keeps showing that bar's meter.

---

## 10. Reliability / edge cases

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

## 11. Acceptance tests

1. `npm run build`, `npm run lint`, and `npm test` pass.
2. App opens with the default Prelude in G Harmonic Minor (the Counting Warm-Up
   and Compound Time Etude are available as samples).
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
10. Kodály: toggle on, under-note labels become ta/ti/ka/ta-a/ta-i; toggle off
    restores numeric labels.
11. Upload a photo/PDF: busy state appears, OMR returns MusicXML, score renders,
    labels and playback work. Verify `POST /api/omr` returns 200.
12. Upload a `.musicxml` file: internal title appears in the header.
13. Blank staff:
    - all 8 measures have a real layout width (no collapsed measures);
    - empty measures show whole rests and hidden anchors keep the layout;
    - clicking the staff adds a note at the clicked pitch/beat;
    - typing A–G adds notes at the moving cursor; 1–5 changes length;
    - Shift+1–5 leaves a rest and advances the cursor; Z/X changes octave;
    - the new note gets a count label and can be selected/edited;
    - Delete and Backspace both replace a selected note/range with equivalent rests;
    - deleting a chord member removes only that notehead, and deleting the base
      note promotes the next member; deleting a tied note clears every segment;
    - Shift-click highlights a range and Delete clears it;
    - ←/→ steps through notes and plays each one;
    - ↑/↓ transposes the selected note and plays it;
    - Shift+←/→ time moves work, including across bar lines;
    - rests section is below note values and converts notes to rests;
    - meter changes regenerate the page in the new meter (4/4, 6/8, etc.);
    - Clear staff empties the notes but keeps the meter.
14. Existing score meter: changing 4/4 to 3/4 is blocked when the bar contains
    4 beats; changing to a meter that fits succeeds and updates counting.
15. Production: `npm run build && npm run server` serves the app at :8000 and
    the API works.

---

## 12. Suggested file structure

```
src/
  App.tsx
  App.css
  index.css
  main.tsx
  api/
    omr.ts               health probe client
  components/
    ScoreView.tsx        OSMD load/render, labels, playhead, scroll
    CountDisplay.tsx     big current-count card
    Controls.tsx         transport, tempo, shuffle, metronome, loop, volume
    LoadPanel.tsx        upload/dropzone, samples, OMR status
    EditorPanel.tsx      selected-note inspector and editor hints
    NotationPalette.tsx  note/rest/accidental/meter palette
    ErrorBoundary.tsx    recover from engrave/render failures
  hooks/
    useOmrHealth.ts      backend availability and re-check
    usePlaybackShortcuts.ts
    useEditorShortcuts.ts
  music/
    analyze.ts           cursor walk → timeline, measures, beats, positions
    counting.ts          count labels, beat grids, live position description
    labels.ts            counting-label placement and grouping
    geometry.ts          score click → snapped note position
    spelling.ts          flat/sharp spelling for edits and MIDI import
    musicxmlEditor.ts    MusicXML note lookup and edits
    blankScore.ts        blank-staff generation and note writing
    midiImport.ts        MIDI → MusicXML
    player.ts            lookahead scheduler, seek/loop/tempo/shuffle
    audio.ts             Web Audio synth + metronome
    demo.ts              built-in MusicXML (with explicit beams)
    types.ts             shared types
    *.test.ts            Vitest suites for the pure music modules
server/
  main.py                FastAPI OMR endpoint + health + static hosting
  requirements.txt
README.md
BUILD_PLAN.md
BUILD_PROMPT.md
```

## 13. Constraints

- No paid APIs or cloud services.
- Keep everything local and runnable on macOS with Docker or a native Audiveris
  install.
- Do not add comments unless necessary.
- Prefer clear, typed modules over monolithic components.
- Keep the score readable at the given zoom; do not hide beams or labels.
