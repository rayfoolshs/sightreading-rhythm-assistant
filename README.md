# Sightreading Rhythm Assistant

Photograph a short piece of sheet music and practise it with a moving playhead, a
metronome, a tempo slider, and a counting label on every note.

The app reads a photo with **Audiveris** (optical music recognition), engraves the
result with **OpenSheetMusicDisplay**, and plays it back with the Web Audio API.

## What it does

- **Photo to score** — upload JPG/PNG/HEIC/WebP/TIFF/PDF or drag it onto the page.
- **Scrolling playhead** — a coral line glides through the notation and the score
  auto-scrolls to follow it.
- **Metronome** — accented clicks on the first beat (and on the dotted-quarter
  pulse in 6/8, 9/8, 12/8).
- **Tempo slider** — 40–200 BPM, adjustable while playing.
- **Counting labels** — each note onset is labelled with its count (`1`, `2 &`,
  `3 e`, …), and a large count card shows the current beat.
- **Practice controls** — loop, sound volume/mute, restart, keyboard shortcuts.
- **No photo?** Two built-in sample pieces demonstrate 4/4 and 6/8 counting.

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

Shortcuts: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> nudge one
quarter note · <kbd>Home</kbd> restart.

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
  music/
    analyze.ts            OSMD cursor walk → timeline + label positions
    counting.ts           count labels, beat grids, position description
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
  mistakes. This first version does not let you correct the recognised score.
- Repeats and jumps are ignored when building the playback timeline.
- Compressed `.mxl` uploads are not accepted directly (photo/PDF and uncompressed
  `.musicxml`/`.xml` are). OMR results are decompressed server-side.
- The synth is a simple oscillator instrument, not a sampled piano.
- Designed for short pieces on one page, as the name suggests.

Natural next steps: OMR correction UI, PDF multi-page queue, repeat/D.C. support,
count-in bar, section looping, and saved practice history.

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
