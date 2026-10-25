# Build Plan — Sightreading Rhythm Assistant

## Goal

A local-first practice app that turns sheet music (photo, PDF, or MusicXML) into
an interactive rhythm-reading session with playback, counting, metronome, tempo,
Kodály syllables, and a notation editor.

## Current status

**Feature-complete for v1.1, plus a post-review maintenance pass.** The app
builds, lints, and runs locally with the OMR server. The default example is the
user-provided *Prelude in G Harmonic Minor* (flute + piano, three staves).

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
- MIDI import (`.mid`/`.midi`): 16th-note quantization, one part per pitched track,
  upper/lower split for wide piano tracks, key/tempo/time-signature extraction.
- Branding/credit: Ray Foo · rayfooproductions.com.
- GitHub Pages publication from a static `gh-pages` branch (OMR disabled in the
  hosted build with a clear in-app notice).
- GitHub backup repository.
- Post-review fixes: key-aware flat/sharp spelling; tied notes sustain across
  the whole chain; chord-member and tied-note deletion; OMR health timeout and
  cache with a re-check path; error boundary; accessibility (live regions, score
  tab order, reduced motion); lazy-loaded OSMD/MIDI chunks.
- Vitest unit suite (`npm test`) covering counting, spelling, MusicXML edits,
  blank staff, MIDI import, counting-label layout and click geometry.

### Known limitations

- Photo OMR requires the local Python + Docker backend. The public GitHub Pages
  build supports samples, MusicXML, and MIDI uploads only.
- The blank staff is a single treble staff, monophonic for click/keyboard input.
  Changing a chord's note value and adding multiple staves need the raw MusicXML
  editor; individual chord notes can be transposed or deleted.
- Kodály syllables are a per-note v1 mapping (`ta`, `ti`, `ka`, `ta-a`, `ta-i`);
  beam-group spellings such as `ti-ti`/`tika-tika` are a future refinement.
- Time signatures on existing scores are validated for note overflow but do not
  automatically reflow notes; blank-staff changes regenerate the page.
- Repeats/D.C. are ignored in the playback timeline.
- MIDI import is basic: triplets/swing are quantized to 16ths, chords at an onset
  share a duration, and complex polyphony may need cleanup.
- Automated unit tests cover the music logic; browser flows (playback, OMR,
  uploads) are still checked by hand.

## Release checklist

- [x] `npm run build`
- [x] `npm run lint`
- [x] `npm test`
- [x] Default prelude loads and renders
- [x] Multi-staff labels + S1/S2/S3 toggles
- [x] Kodály toggle
- [x] Editor/keyboard/delete/range flows
- [x] Chord-member and tied-note deletion
- [x] Flat/sharp spelling preserved through edits
- [x] OMR health/end-to-end round trip
- [x] MIDI import tested with melody, duet, and wide piano tracks
- [x] GitHub Pages build configured with repo base path
- [x] Hosted-build OMR fallback message
- [x] Commit latest source and push `main`
- [x] Make repository public
- [x] Publish the static build to the `gh-pages` branch
- [x] Set GitHub Pages to serve the `gh-pages` branch
- [x] Verify deployed Pages URL (default prelude + MIDI upload): <https://rayfoolshs.github.io/sightreading-rhythm-assistant/>
- [x] Tag release `v1.1.0`
- [x] Republish `gh-pages` after the post-1.1 fixes

## Post-1.0 roadmap

1. Hosted OMR option (cloud OCR or a self-hosted backend) for the public demo.
2. Full chord-aware editor, drag-to-select ranges, drag-to-move notes.
3. Kodály beam-group spellings and compound-meter refinements.
4. Automated Playwright tests for browser flows (OMR, Pages); unit coverage
   already covers counting, editing, blank staff, spelling and MIDI import.
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
npm test
```

Hosted build:

```bash
VITE_BASE_PATH=/sightreading-rhythm-assistant/ npm run build
```

### Publishing the hosted build

Pages serves the static `gh-pages` branch (no Actions workflow needed):

```bash
VITE_BASE_PATH=/sightreading-rhythm-assistant/ npm run build
git worktree add /tmp/sr-pages gh-pages
rsync -a --delete --exclude '.git' dist/ /tmp/sr-pages/
touch /tmp/sr-pages/.nojekyll
git -C /tmp/sr-pages add -A
git -C /tmp/sr-pages commit -m "Deploy hosted build"
git -C /tmp/sr-pages push origin gh-pages
git worktree remove /tmp/sr-pages
```

The hosted build is live at <https://rayfoolshs.github.io/sightreading-rhythm-assistant/>
and is published from the `gh-pages` branch (static files only),
so it does not need a GitHub Actions workflow token scope. A future improvement
is to deploy from Actions if the maintainer adds the `workflow` token scope.
