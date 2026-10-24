# Build Plan — Sightreading Rhythm Assistant

## Goal

A local-first practice app that turns sheet music (photo, PDF, or MusicXML) into
an interactive rhythm-reading session with playback, counting, metronome, tempo,
Kodály syllables, and a notation editor.

## Current status

**Feature-complete for v1.0.** The app builds, lints, and runs locally with the
OMR server. The default example is the user-provided *Prelude in G Harmonic
Minor* (flute + piano, three staves).

### Completed

- OMR pipeline: FastAPI + Pillow/Pillow-HEIF + Audiveris in Docker, `.mxl`
  extraction, HEIC support, JSON errors, health endpoint.
- OSMD engraving, explicit demo beaming, auto-beaming fallback.
- Count labels: numeric rhythm counting per note, long-note ranges, per-staff
  labels, and a Kodály syllable toggle.
- Multi-staff counting: separate counting rows for each staff; S1/S2/S3
  visibility toggles.
- Playback: Web Audio synth, metronome accents, tempo slider, loop, seek, shuffle
  feel with swing slider.
- Editor: flat.io-style left palette; click-to-write notes on a blank staff;
  keyboard note input (A–G, Z/X octave, 1–5 lengths, Shift+1–5 rests); rest
  palette; time-signature selector; pitch/time movement; note/range deletion
  with equivalent rests; undo/redo; raw MusicXML editor.
- Arrow-key auditioning: ←/→ walk notes and play them; ↑/↓ transpose and play;
  Shift+arrow editing.
- Default prelude on load, built-in 4/4 and 6/8 samples, blank staff.
- Branding/credit: Ray Foo · rayfooproductions.com.
- GitHub Pages publication from a static `gh-pages` branch (OMR disabled in the
  hosted build with a clear in-app notice).
- GitHub backup repository.

### Known limitations

- Photo OMR requires the local Python + Docker backend. The public GitHub Pages
  build supports samples and MusicXML uploads only.
- The blank staff is a single treble staff, monophonic for click/keyboard input.
  Chords, multiple staves, and advanced notation use the raw MusicXML editor.
- Kodály syllables are a per-note v1 mapping (`ta`, `ti`, `ka`, `ta-a`, `ta-i`);
  beam-group spellings such as `ti-ti`/`tika-tika` are a future refinement.
- Time signatures on existing scores are validated for note overflow but do not
  automatically reflow notes; blank-staff changes regenerate the page.
- Repeats/D.C. are ignored in the playback timeline.
- No automated test suite yet; validation is via build/lint plus manual browser
  smoke tests.

## Release checklist

- [x] `npm run build`
- [x] `npm run lint`
- [x] Default prelude loads and renders
- [x] Multi-staff labels + S1/S2/S3 toggles
- [x] Kodály toggle
- [x] Editor/keyboard/delete/range flows
- [x] OMR health/end-to-end round trip
- [x] GitHub Pages build configured with repo base path
- [x] Hosted-build OMR fallback message
- [ ] Commit latest source and push `main`
- [ ] Make repository public
- [x] Publish the static build to the `gh-pages` branch
- [x] Set GitHub Pages to serve the `gh-pages` branch
- [x] Verify deployed Pages URL: <https://rayfoolshs.github.io/sightreading-rhythm-assistant/>
- [ ] Tag release `v1.0.0` (optional)

## Post-1.0 roadmap

1. Hosted OMR option (cloud OCR or a self-hosted backend) for the public demo.
2. Full chord-aware editor, drag-to-select ranges, drag-to-move notes.
3. Kodály beam-group spellings and compound-meter refinements.
4. Automated Playwright tests for OMR, counting, editor, and Pages.
5. PDF multi-page import, repeats/D.C., count-in bar, section looping.
6. Persist practice history and custom exercises.

## Commands

```bash
npm install
npm run server:setup
colima start          # or Docker Desktop
npm run server        # OMR API :8000
npm run dev           # app :5173
npm run build
npm run lint
```

Hosted build:

```bash
VITE_BASE_PATH=/sightreading-rhythm-assistant/ npm run build
```

The hosted build is live at <https://rayfoolshs.github.io/sightreading-rhythm-assistant/>
and is published from the `gh-pages` branch (static files only),
so it does not need a GitHub Actions workflow token scope. A future improvement
is to deploy from Actions if the maintainer adds the `workflow` token scope.
