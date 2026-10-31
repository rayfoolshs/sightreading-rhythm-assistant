# Changelog

All notable changes to the Sightreading Rhythm Assistant are recorded here.
The project follows [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-10-31

### Changed

- Moved the **Practice desk** panel to the top of the page, spanning the full
  width above the score, with a horizontal layout on wide screens and a stacked
  layout on smaller ones.
- Simplified the sidebar to the load panel only at tablet widths.

### Added

- This changelog, a version history section in the README, and the running
  version in the app footer.
- Post-review maintenance pass: key-aware flat/sharp spelling, tied notes that
  sustain across the whole chain, chord-member and tied-note deletion,
  OMR health timeout and re-check, error boundary, accessibility improvements,
  and lazy-loaded OSMD/MIDI chunks.

### Fixed

- The hosted build and local build now report the same application version.

## [1.1.0] — 2026-10-24

### Added

- MIDI import (`.mid`/`.midi`) with 16th-note quantization, one part per pitched
  track, and upper/lower staff splitting for wide piano tracks.
- Key and tempo extraction from MIDI files.

### Changed

- Expanded the hosted Pages build to support samples, MusicXML, and MIDI uploads.
- Clarified that photo/PDF OMR needs the local Python + Docker backend.

## [1.0.0] — 2026-10-24

### Added

- First release: photo/PDF to score via Audiveris OMR, OpenSheetMusicDisplay
  engraving, scrolling playhead, metronome, tempo control, numeric and Kodály
  counting labels, per-staff counting toggles, loop, volume, and keyboard
  shortcuts.
- Score editor with notation palette, blank-staff note entry, rest palette,
  accidentals, octave/time-signature controls, undo/redo, and a raw MusicXML
  editor.
- Built-in Prelude, 4/4 and 6/8 samples, plus GitHub Pages deployment.

[1.2.0]: https://github.com/rayfoolshs/sightreading-rhythm-assistant/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/rayfoolshs/sightreading-rhythm-assistant/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/rayfoolshs/sightreading-rhythm-assistant/releases/tag/v1.0.0
