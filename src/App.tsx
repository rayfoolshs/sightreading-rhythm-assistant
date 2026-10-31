import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Controls } from './components/Controls'
import { CountDisplay } from './components/CountDisplay'
import { EditorPanel } from './components/EditorPanel'
import { LoadPanel } from './components/LoadPanel'
import { NotationPalette } from './components/NotationPalette'
import { ScoreView, type ScoreViewHandle } from './components/ScoreView'
import { AudioEngine } from './music/audio'
import { describePosition } from './music/counting'
import { demoPieces } from './music/demo'
import {
  deleteNote,
  findEditableNote,
  naturalizeNote,
  parseEditableNotes,
  setNoteDuration,
  setTimeSignature,
  toggleRest,
  transposeNote,
  validateMusicXml,
  type EditResult,
} from './music/musicxmlEditor'
import {
  changeBlankMeter,
  createBlankMusicXml,
  insertBlankNote,
  meterFromXml,
  moveBlankNote,
  normalizeBlankXml,
} from './music/blankScore'
import { Player } from './music/player'
import { useEditorShortcuts } from './hooks/useEditorShortcuts'
import { useOmrHealth } from './hooks/useOmrHealth'
import { usePlaybackShortcuts } from './hooks/usePlaybackShortcuts'
import type { NoteSelection, ScoreAnalysis } from './music/types'

interface OmrResponse {
  musicxml: string
  title?: string
}

function musicXmlTitle(xml: string): string | null {
  try {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    const element =
      document.querySelector('work-title') ??
      document.querySelector('movement-title')
    const title = element?.textContent?.trim()
    return title || null
  } catch {
    return null
  }
}

function App() {
  const [scoreXml, setScoreXml] = useState(demoPieces[0].xml)
  const [scoreName, setScoreName] = useState(demoPieces[0].name)
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null)
  const [q, setQ] = useState(0)
  const [bpm, setBpm] = useState(84)
  const [playing, setPlaying] = useState(false)
  const [metronome, setMetronome] = useState(true)
  const [loop, setLoop] = useState(false)
  const [follow, setFollow] = useState(true)
  const [shuffle, setShuffle] = useState(false)
  const [shuffleAmount, setShuffleAmount] = useState(66)
  const [volume, setVolume] = useState(0.75)
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(false)
  const { omrAvailable, refresh: refreshOmr, probe: probeOmr } = useOmrHealth()
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selection, setSelection] = useState<NoteSelection | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [future, setFuture] = useState<string[]>([])
  const [originalXml, setOriginalXml] = useState(demoPieces[0].xml)
  const [editError, setEditError] = useState<string | null>(null)
  const [countingStyle, setCountingStyle] = useState<'numbers' | 'kodaly'>(
    'numbers',
  )
  const [staffVisibility, setStaffVisibility] = useState<
    Record<number, boolean>
  >({})
  const [xmlOpen, setXmlOpen] = useState(false)
  const [xmlDraft, setXmlDraft] = useState('')
  const [xmlError, setXmlError] = useState<string | null>(null)
  const [blankMode, setBlankMode] = useState(false)
  const [inputDuration, setInputDuration] = useState(1)
  const [inputDotted, setInputDotted] = useState(false)
  const [inputRest, setInputRest] = useState(false)
  const [inputAccidental, setInputAccidental] = useState(0)
  const [inputOctave, setInputOctave] = useState(4)
  const [inputCursor, setInputCursor] = useState({
    measureIndex: 0,
    startQ: 0,
  })
  const [selections, setSelections] = useState<NoteSelection[]>([])
  const [rangeAnchor, setRangeAnchor] = useState<NoteSelection | null>(null)

  const engine = useMemo(() => new AudioEngine(), [])
  const player = useMemo(() => new Player(engine), [engine])
  const scoreRef = useRef<ScoreViewHandle>(null)
  const lastUiUpdate = useRef(0)
  const tempoRef = useRef(bpm)
  const freshPieceRef = useRef(true)

  const handlePosition = useCallback((position: number, isPlaying: boolean) => {
    scoreRef.current?.sync(position, isPlaying)
    const now = performance.now()
    if (!isPlaying || now - lastUiUpdate.current > 70) {
      lastUiUpdate.current = now
      setQ(position)
    }
  }, [])

  useEffect(() => {
    player.setCallbacks({
      onPosition: handlePosition,
      onStateChange: setPlaying,
      onEnd: () => setPlaying(false),
    })
  }, [player, handlePosition])

  useEffect(() => {
    engine.setVolume(volume, muted)
  }, [engine, volume, muted])

  useEffect(() => {
    tempoRef.current = bpm
  }, [bpm])

  useEffect(() => {
    player.setShuffle(shuffle, shuffleAmount)
  }, [player, shuffle, shuffleAmount])

  const handleAnalysis = useCallback(
    (next: ScoreAnalysis) => {
      const nextBpm = freshPieceRef.current
        ? next.initialBpm
        : tempoRef.current
      freshPieceRef.current = false
      setStaffVisibility((previous) => {
        const nextVisibility: Record<number, boolean> = {}
        for (let index = 0; index < next.staffCount; index += 1) {
          nextVisibility[index] = previous[index] !== false
        }
        return nextVisibility
      })
      setAnalysis(next)
      setBpm(nextBpm)
      setQ(0)
      player.load(next, nextBpm)
      scoreRef.current?.sync(0, false)
    },
    [player],
  )

  const handleScoreError = useCallback(
    (message: string) => {
      setError(message)
      // The canvas has been cleared, so do not let Play keep sounding the
      // previous engraving.
      setAnalysis(null)
      player.stop()
    },
    [player],
  )

  const loadScore = useCallback(
    (xml: string, name: string) => {
      player.stop()
      setPlaying(false)
      setAnalysis(null)
      setQ(0)
      setError(null)
      freshPieceRef.current = true
      setOriginalXml(xml)
      setEditMode(false)
      setSelection(null)
      setSelections([])
      setRangeAnchor(null)
      setHistory([])
      setFuture([])
      setEditError(null)
      setXmlOpen(false)
      setXmlError(null)
      setBlankMode(false)
      setStaffVisibility({})
      setInputDuration(1)
      setInputDotted(false)
      setInputRest(false)
      setInputAccidental(0)
      setInputOctave(4)
      setInputCursor({ measureIndex: 0, startQ: 0 })
      setScoreXml(xml)
      setScoreName(name)
      scoreRef.current?.scrollToTop()
    },
    [player],
  )

  const editableNotes = useMemo(
    () => parseEditableNotes(scoreXml),
    [scoreXml],
  )
  const selectedNote = useMemo(
    () =>
      selection ? findEditableNote(editableNotes, selection) : undefined,
    [editableNotes, selection],
  )

  const applyEditedXml = useCallback(
    (nextXml: string, normalize = blankMode) => {
      const normalized = normalize ? normalizeBlankXml(nextXml) : nextXml
      if (normalized === scoreXml) {
        return
      }
      player.pause()
      setHistory((previous) => [...previous.slice(-49), scoreXml])
      setFuture([])
      setEditError(null)
      setScoreXml(normalized)
    },
    [blankMode, player, scoreXml],
  )

  const applyEditResult = useCallback(
    (result: EditResult | string) => {
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      setEditError(null)
      setSelection(result.selection)
      setSelections([result.selection])
      setRangeAnchor(result.selection)
      applyEditedXml(result.xml)
    },
    [applyEditedXml],
  )

  const handleEnterEdit = useCallback(() => {
    player.pause()
    setEditMode(true)
    setEditError(null)
  }, [player])

  const handleExitEdit = useCallback(() => {
    setEditMode(false)
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    setEditError(null)
    setXmlOpen(false)
  }, [])

  const handleUndo = useCallback(() => {
    if (history.length === 0) {
      return
    }
    player.pause()
    const previous = history[history.length - 1]
    setFuture((next) => [scoreXml, ...next])
    setHistory((items) => items.slice(0, -1))
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    setEditError(null)
    setInputCursor({ measureIndex: 0, startQ: 0 })
    setScoreXml(previous)
  }, [history, player, scoreXml])

  const handleRedo = useCallback(() => {
    if (future.length === 0) {
      return
    }
    player.pause()
    const next = future[0]
    setHistory((items) => [...items, scoreXml])
    setFuture((items) => items.slice(1))
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    setEditError(null)
    setInputCursor({ measureIndex: 0, startQ: 0 })
    setScoreXml(next)
  }, [future, player, scoreXml])

  const noteHeadList = useMemo(() => {
    if (!analysis) {
      return [] as NoteSelection[]
    }
    return analysis.steps
      .flatMap((step) =>
        step.noteHeads.map((head) => ({
          measureIndex: step.measureIndex,
          onsetQ: step.relQ,
          midi: head.midi,
        })),
      )
      .sort(
        (a, b) =>
          a.measureIndex - b.measureIndex ||
          a.onsetQ - b.onsetQ ||
          (a.midi ?? 0) - (b.midi ?? 0),
      )
  }, [analysis])

  const cursorAfter = useCallback(
    (measureIndex: number, positionQ: number) => {
      const measures = analysis?.measures ?? []
      const measure = measures.find((item) => item.index === measureIndex)
      if (!measure) {
        return { measureIndex: 0, startQ: 0 }
      }
      if (
        positionQ >= measure.durationQ - 0.0001 &&
        measureIndex < measures.length - 1
      ) {
        return { measureIndex: measureIndex + 1, startQ: 0 }
      }
      return {
        measureIndex,
        startQ: Math.max(0, Math.min(measure.durationQ, positionQ)),
      }
    },
    [analysis],
  )

  const handleSelectNote = useCallback(
    (next: NoteSelection, extend = false) => {
      setEditError(null)
      if (extend && rangeAnchor) {
        const anchorIndex = noteHeadList.findIndex(
          (item) =>
            item.measureIndex === rangeAnchor.measureIndex &&
            Math.abs(item.onsetQ - rangeAnchor.onsetQ) < 0.02 &&
            item.midi === rangeAnchor.midi,
        )
        const nextIndex = noteHeadList.findIndex(
          (item) =>
            item.measureIndex === next.measureIndex &&
            Math.abs(item.onsetQ - next.onsetQ) < 0.02 &&
            item.midi === next.midi,
        )
        if (anchorIndex >= 0 && nextIndex >= 0) {
          const start = Math.min(anchorIndex, nextIndex)
          const end = Math.max(anchorIndex, nextIndex)
          setSelections(noteHeadList.slice(start, end + 1))
          setSelection(next)
          return
        }
      }
      setSelection(next)
      setSelections([next])
      setRangeAnchor(next)
      if (blankMode && analysis) {
        const note = findEditableNote(parseEditableNotes(scoreXml), next)
        if (note) {
          setInputCursor(
            cursorAfter(
              note.measureIndex,
              note.onsetQ + note.durationQ,
            ),
          )
        }
      }
    },
    [
      analysis,
      blankMode,
      cursorAfter,
      noteHeadList,
      rangeAnchor,
      scoreXml,
    ],
  )

  const handleTranspose = useCallback(
    (semitones: number) => {
      if (!selection) {
        return
      }
      applyEditResult(transposeNote(scoreXml, selection, semitones))
    },
    [applyEditResult, scoreXml, selection],
  )

  const handleNoteDuration = useCallback(
    (value: number) => {
      setInputDuration(value)
      setInputRest(false)
      if (!selection) {
        return
      }
      if (selectedNote?.isRest) {
        const toggled = toggleRest(scoreXml, selection)
        if (typeof toggled === 'string') {
          setEditError(toggled)
          return
        }
        applyEditResult(setNoteDuration(toggled.xml, toggled.selection, value))
        return
      }
      applyEditResult(setNoteDuration(scoreXml, selection, value))
    },
    [applyEditResult, scoreXml, selectedNote, selection],
  )

  const handleRestDuration = useCallback(
    (value: number) => {
      setInputDuration(value)
      setInputRest(true)
      if (!selection) {
        return
      }
      if (selectedNote?.isRest) {
        applyEditResult(setNoteDuration(scoreXml, selection, value))
        return
      }
      const toggled = toggleRest(scoreXml, selection)
      if (typeof toggled === 'string') {
        setEditError(toggled)
        return
      }
      const resized = setNoteDuration(toggled.xml, toggled.selection, value)
      if (typeof resized === 'string') {
        applyEditResult(toggled)
        setEditError(
          'Converted to a rest with its original duration; the chosen rest value would not fit without deleting following notes.',
        )
        return
      }
      applyEditResult(resized)
    },
    [applyEditResult, scoreXml, selectedNote, selection],
  )

  const handleDot = useCallback(() => {
    if (!selectedNote) {
      if (blankMode) {
        setInputDotted((value) => !value)
      }
      return
    }
    if (!selection) {
      return
    }
    const target =
      selectedNote.dots > 0
        ? selectedNote.durationQ / 1.5
        : selectedNote.durationQ * 1.5
    setInputDotted(selectedNote.dots === 0)
    applyEditResult(setNoteDuration(scoreXml, selection, target))
  }, [applyEditResult, blankMode, scoreXml, selectedNote, selection])

  const handleAccidental = useCallback(
    (semitones: number) => {
      setInputAccidental(semitones)
      if (!selection || !selectedNote || selectedNote.isRest) {
        return
      }
      applyEditResult(transposeNote(scoreXml, selection, semitones))
    },
    [applyEditResult, scoreXml, selectedNote, selection],
  )

  const handleNatural = useCallback(() => {
    setInputAccidental(0)
    if (!selection || !selectedNote || selectedNote.isRest) {
      return
    }
    applyEditResult(naturalizeNote(scoreXml, selection))
  }, [applyEditResult, scoreXml, selectedNote, selection])

  const startBlankStaff = useCallback(() => {
    loadScore(createBlankMusicXml(), 'Blank Staff')
    setBlankMode(true)
    setEditMode(true)
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    setInputDuration(1)
    setInputDotted(false)
    setInputRest(false)
    setInputAccidental(0)
    setInputOctave(4)
    setInputCursor({ measureIndex: 0, startQ: 0 })
  }, [loadScore])

  const handleClearStaff = useCallback(() => {
    if (blankMode) {
      if (!window.confirm('Clear all notes from this staff?')) {
        return
      }
      const result = changeBlankMeter(scoreXml, meterFromXml(scoreXml))
      setSelection(null)
      setSelections([])
      setRangeAnchor(null)
      setInputCursor({ measureIndex: 0, startQ: 0 })
      applyEditedXml(result.xml)
      return
    }
    if (
      !window.confirm(
        'Clear the staff and start an empty 8-bar page? This replaces the current score.',
      )
    ) {
      return
    }
    startBlankStaff()
  }, [applyEditedXml, blankMode, scoreXml, startBlankStaff])

  const cursorForDuration = useCallback(
    (
      cursor: { measureIndex: number; startQ: number },
      durationQ: number,
    ) => {
      const measures = analysis?.measures ?? []
      let measure = measures.find(
        (item) => item.index === cursor.measureIndex,
      )
      if (!measure) {
        return null
      }
      let measureIndex = cursor.measureIndex
      let startQ = cursor.startQ
      if (startQ + durationQ > measure.durationQ + 0.0001) {
        if (measureIndex >= measures.length - 1) {
          return null
        }
        measureIndex += 1
        startQ = 0
        measure = measures.find((item) => item.index === measureIndex)
        if (!measure || durationQ > measure.durationQ + 0.0001) {
          return null
        }
      }
      return { measureIndex, startQ }
    },
    [analysis],
  )

  const insertKeyboardNote = useCallback(
    (letter: string) => {
      if (!blankMode) {
        return
      }
      const semitones: Record<string, number> = {
        c: 0,
        d: 2,
        e: 4,
        f: 5,
        g: 7,
        a: 9,
        b: 11,
      }
      const semitone = semitones[letter]
      if (semitone === undefined) {
        return
      }
      const midi = Math.max(
        24,
        Math.min(
          100,
          (inputOctave + 1) * 12 + semitone + inputAccidental,
        ),
      )
      const durationQ = inputDuration * (inputDotted ? 1.5 : 1)
      const start = cursorForDuration(inputCursor, durationQ)
      if (!start) {
        setEditError(
          'There is not enough room for that note. Try a shorter value or move the cursor.',
        )
        return
      }
      const result = insertBlankNote(scoreXml, {
        measureIndex: start.measureIndex,
        startQ: start.startQ,
        durQ: durationQ,
        midi,
        step: letter.toUpperCase(),
        alter: inputAccidental,
      })
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      setEditError(null)
      setInputRest(false)
      setSelection(result.selection)
      setSelections([result.selection])
      setRangeAnchor(result.selection)
      setInputCursor(
        cursorAfter(start.measureIndex, start.startQ + durationQ),
      )
      applyEditedXml(result.xml)
    },
    [
      applyEditedXml,
      blankMode,
      cursorAfter,
      cursorForDuration,
      inputAccidental,
      inputCursor,
      inputDotted,
      inputDuration,
      inputOctave,
      scoreXml,
    ],
  )

  const insertRestAtCursor = useCallback(
    (overrideDuration?: number) => {
      if (!blankMode) {
        return
      }
      const duration = overrideDuration ?? inputDuration
      const durationQ = duration * (inputDotted ? 1.5 : 1)
    const start = cursorForDuration(inputCursor, durationQ)
    if (!start) {
      setEditError('There is not enough room for that rest in this bar.')
      return
    }
    setEditError(null)
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    setInputCursor(cursorAfter(start.measureIndex, start.startQ + durationQ))
    },
    [
      blankMode,
      cursorAfter,
      cursorForDuration,
      inputCursor,
      inputDotted,
      inputDuration,
    ],
  )

  const handleDeleteSelection = useCallback(() => {
    if (selections.length === 0) {
      return
    }
    const parsed = parseEditableNotes(scoreXml)
    let nextXml = scoreXml
    let changed = false
    let unmatched = 0
    const seen = new Set<string>()
    for (const item of selections) {
      const key = `${item.measureIndex}:${item.onsetQ}:${item.midi}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      const note = findEditableNote(parsed, item)
      if (!note) {
        unmatched += 1
        continue
      }
      if (note.isRest) {
        continue
      }
      const result = deleteNote(nextXml, item)
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      nextXml = result.xml
      changed = true
    }
    if (!changed) {
      setEditError(
        unmatched > 0
          ? 'Could not match that notehead to the score. Click the note again and retry.'
          : 'Nothing to delete — those notes are already rests.',
      )
      return
    }
    setEditError(null)
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    if (blankMode && selections[0]) {
      setInputCursor({
        measureIndex: selections[0].measureIndex,
        startQ: selections[0].onsetQ,
      })
    }
    applyEditedXml(nextXml)
  }, [applyEditedXml, blankMode, scoreXml, selections])

  const previewMidi = useCallback(
    (midi: number | null) => {
      if (midi === null) {
        return
      }
      engine.ensure()
      const frequency = 440 * 2 ** ((midi - 69) / 12)
      engine.playNote(
        frequency,
        engine.context.currentTime + 0.01,
        0.5,
        0.8,
      )
    },
    [engine],
  )

  const handleMovePitch = useCallback(
    (semitones: number) => {
      if (!selection) {
        return
      }
      const result = transposeNote(scoreXml, selection, semitones)
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      applyEditResult(result)
      previewMidi(result.selection.midi)
    },
    [applyEditResult, previewMidi, scoreXml, selection],
  )

  const handleMoveTime = useCallback(
    (deltaQ: number) => {
      if (!selection) {
        return
      }
      if (!blankMode) {
        setEditError(
          'Moving notes in time is available on the blank staff. Use MusicXML for an existing score.',
        )
        return
      }
      const result = moveBlankNote(scoreXml, selection, deltaQ)
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      setEditError(null)
      setSelection(result.selection)
      setSelections([result.selection])
      setRangeAnchor(result.selection)
      setInputCursor(
        cursorAfter(
          result.selection.measureIndex,
          result.selection.onsetQ + result.durationQ,
        ),
      )
      applyEditedXml(result.xml)
      previewMidi(result.selection.midi)
    },
    [
      applyEditedXml,
      blankMode,
      cursorAfter,
      previewMidi,
      scoreXml,
      selection,
    ],
  )

  const handleNavigate = useCallback(
    (direction: number) => {
      if (noteHeadList.length === 0) {
        return
      }
      if (player.isPlaying) {
        player.pause()
      }
      const index = selection
        ? noteHeadList.findIndex(
            (item) =>
              item.measureIndex === selection.measureIndex &&
              Math.abs(item.onsetQ - selection.onsetQ) < 0.02 &&
              item.midi === selection.midi,
          )
        : -1
      const nextIndex =
        index === -1
          ? direction > 0
            ? 0
            : noteHeadList.length - 1
          : index + direction
      if (nextIndex < 0 || nextIndex >= noteHeadList.length) {
        return
      }
      const target = noteHeadList[nextIndex]
      setSelection(target)
      setSelections([target])
      setRangeAnchor(target)
      setEditError(null)
      if (blankMode && analysis) {
        const note = findEditableNote(parseEditableNotes(scoreXml), target)
        if (note) {
          setInputCursor(
            cursorAfter(
              note.measureIndex,
              note.onsetQ + note.durationQ,
            ),
          )
        }
      }
      scoreRef.current?.focusSelection(target)
      previewMidi(target.midi)
    },
    [
      analysis,
      blankMode,
      cursorAfter,
      noteHeadList,
      player,
      previewMidi,
      scoreXml,
      selection,
    ],
  )

  const handleInputNote = useCallback(
    (input: { measureIndex: number; startQ: number; midi: number; step?: string }) => {
      if (!blankMode) {
        return
      }
      const durationQ = inputDuration * (inputDotted ? 1.5 : 1)
      if (inputRest) {
        // The empty staff already rests here, so clicking simply moves the
        // write cursor past the rest instead of writing anything.
        setEditError(null)
        setInputCursor(cursorAfter(input.measureIndex, input.startQ + durationQ))
        return
      }
      const midi = Math.max(24, Math.min(100, input.midi + inputAccidental))
      const result = insertBlankNote(scoreXml, {
        measureIndex: input.measureIndex,
        startQ: input.startQ,
        durQ: durationQ,
        midi,
        step: input.step,
        alter: inputAccidental,
      })
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      setEditError(null)
      setSelection(result.selection)
      setSelections([result.selection])
      setRangeAnchor(result.selection)
      setInputCursor(
        cursorAfter(input.measureIndex, input.startQ + durationQ),
      )
      applyEditedXml(result.xml)
    },
    [
      applyEditedXml,
      blankMode,
      cursorAfter,
      inputAccidental,
      inputDotted,
      inputDuration,
      inputRest,
      scoreXml,
    ],
  )

  const meterTarget = blankMode ? 0 : selection?.measureIndex ?? 0
  const currentMeter = useMemo(() => {
    if (!analysis) {
      return { beats: 4, beatType: 4 }
    }
    const measure =
      analysis.measures.find((item) => item.index === meterTarget) ??
      analysis.measures[0]
    return measure?.timeSignature ?? { beats: 4, beatType: 4 }
  }, [analysis, meterTarget])

  const handleMeter = useCallback(
    (beats: number, beatType: number) => {
      if (blankMode) {
        const result = changeBlankMeter(scoreXml, { beats, beatType })
        setSelection(null)
        setSelections([])
        setRangeAnchor(null)
        setInputCursor({ measureIndex: 0, startQ: 0 })
        applyEditedXml(result.xml)
        if (result.dropped > 0) {
          setEditError(
            `${result.dropped} note${result.dropped === 1 ? '' : 's'} did not fit the new bar length and were removed.`,
          )
        }
        return
      }
      const newDuration = beats * (4 / beatType)
      const targetNotes = parseEditableNotes(scoreXml).filter(
        (note) => note.measureIndex === meterTarget && !note.isRest,
      )
      const longest = targetNotes.reduce(
        (max, note) => Math.max(max, note.onsetQ + note.durationQ),
        0,
      )
      if (longest > newDuration + 0.01) {
        setEditError(
          `Bar ${meterTarget + 1} already needs ${longest.toFixed(2)} beats, but ${beats}/${beatType} only holds ${newDuration.toFixed(2)}. Shorten or remove notes first, or use the blank staff.`,
        )
        return
      }
      const result = setTimeSignature(
        scoreXml,
        meterTarget,
        beats,
        beatType,
      )
      if (typeof result === 'string') {
        setEditError(result)
        return
      }
      setEditError(null)
      applyEditedXml(result.xml)
    },
    [applyEditedXml, blankMode, meterTarget, scoreXml],
  )

  const changeTempo = useCallback(
    (value: number) => {
      const clamped = Math.max(40, Math.min(200, Math.round(value)))
      setBpm(clamped)
      player.setBpm(clamped)
    },
    [player],
  )

  const changeMetronome = useCallback(
    (enabled: boolean) => {
      setMetronome(enabled)
      player.setMetronome(enabled)
    },
    [player],
  )

  const handlePreview = useCallback(() => {
    if (!selectedNote) {
      return
    }
    previewMidi(selectedNote.midi)
  }, [previewMidi, selectedNote])

  const openXmlEditor = useCallback(() => {
    setXmlDraft(scoreXml)
    setXmlError(null)
    setXmlOpen(true)
  }, [scoreXml])

  useEffect(() => {
    if (!xmlOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setXmlOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [xmlOpen])

  const applyXmlDraft = useCallback(() => {
    const validation = validateMusicXml(xmlDraft)
    if (validation) {
      setXmlError(validation)
      return
    }
    setXmlOpen(false)
    setXmlError(null)
    setSelection(null)
    setSelections([])
    setRangeAnchor(null)
    setBlankMode(false)
    applyEditedXml(xmlDraft, false)
  }, [applyEditedXml, xmlDraft])

  const downloadXml = useCallback(() => {
    const blob = new Blob([xmlDraft], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${scoreName.replace(/[^\w-]+/g, '-') || 'score'}.musicxml`
    link.click()
    URL.revokeObjectURL(url)
  }, [scoreName, xmlDraft])

  const handleRevert = useCallback(() => {
    setSelection(null)
    applyEditedXml(originalXml)
  }, [applyEditedXml, originalXml])

  const handleToggle = useCallback(() => {
    engine.ensure()
    player.toggle()
  }, [engine, player])

  const handleRestart = useCallback(() => {
    player.seek(0)
    setQ(0)
    scoreRef.current?.scrollToTop()
  }, [player])

  const handlePrint = useCallback(() => {
    if (typeof window.print !== 'function') {
      setError(
        'Printing is not available in this installed web app. Open the site in Safari and use Share → Print.',
      )
      return
    }
    setError(null)
    window.print()
  }, [])

  usePlaybackShortcuts({
    editMode,
    player,
    onToggle: handleToggle,
    onRestart: handleRestart,
  })

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      const lower = file.name.toLowerCase()
      let statusTimer: number | null = null
      try {
        if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
          const buffer = await file.arrayBuffer()
          const { midiToMusicXml } = await import('./music/midiImport')
          const result = midiToMusicXml(
            buffer,
            file.name.replace(/\.[^.]+$/, ''),
          )
          loadScore(result.xml, result.title)
          return
        }
        if (!lower.endsWith('.xml') && !lower.endsWith('.musicxml')) {
          let available = omrAvailable
          if (available === false) {
            // The backend may have been started after the page loaded.
            available = await probeOmr()
          }
          if (available === false) {
            throw new Error(
              'Photo/scanned recognition needs the local Audiveris server. This hosted demo supports the built-in examples and MusicXML uploads. Run the project locally for photo OMR.',
            )
          }
        }
        if (lower.endsWith('.xml') || lower.endsWith('.musicxml')) {
          const xml = await file.text()
          const fallback = file.name.replace(/\.[^.]+$/, '')
          loadScore(xml, musicXmlTitle(xml) ?? fallback)
          return
        }
        if (lower.endsWith('.mxl')) {
          throw new Error(
            'Compressed .mxl files are not supported yet. Export as MusicXML (.musicxml) or upload a photo/PDF.',
          )
        }
        setBusy(true)
        setStatus('Uploading your sheet music…')
        statusTimer = window.setTimeout(() => {
          setStatus('Reading notation with Audiveris — this can take a minute.')
        }, 1200)
        const form = new FormData()
        form.append('file', file)
        const response = await fetch('/api/omr', {
          method: 'POST',
          body: form,
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            detail?: string
          } | null
          throw new Error(
            payload?.detail ??
              `The OMR server returned an error (${response.status}).`,
          )
        }
        const data = (await response.json()) as OmrResponse
        if (!data.musicxml) {
          throw new Error('The OMR server did not return any sheet music.')
        }
        loadScore(data.musicxml, data.title || file.name.replace(/\.[^.]+$/, ''))
      } catch (err) {
        const message =
          err instanceof TypeError
            ? 'Could not reach the OMR server. Start it with "npm run server" (see README) and try again.'
            : err instanceof Error
              ? err.message
              : 'Something went wrong while loading this file.'
        setError(message)
      } finally {
        if (statusTimer !== null) {
          window.clearTimeout(statusTimer)
        }
        setBusy(false)
        setStatus('')
      }
    },
    [loadScore, omrAvailable, probeOmr],
  )

  const handleDemo = useCallback(
    (id: string) => {
      const demo = demoPieces.find((piece) => piece.id === id)
      if (demo) {
        loadScore(demo.xml, demo.name)
      }
    },
    [loadScore],
  )

  useEditorShortcuts({
    editMode,
    blankMode,
    selection,
    selections,
    onDeleteSelection: handleDeleteSelection,
    onMovePitch: handleMovePitch,
    onMoveTime: handleMoveTime,
    onNavigate: handleNavigate,
    onNoteDuration: handleNoteDuration,
    onRestDuration: handleRestDuration,
    onTranspose: handleTranspose,
    onDot: handleDot,
    insertKeyboardNote,
    insertRestAtCursor,
    setInputDuration,
    setInputRest,
    setInputOctave,
  })

  const position = useMemo(
    () => (analysis ? describePosition(analysis, q) : null),
    [analysis, q],
  )

  const inputCursorLabel = useMemo(() => {
    if (!analysis) {
      return 'bar 1'
    }
    const measure =
      analysis.measures.find(
        (item) => item.index === inputCursor.measureIndex,
      ) ?? analysis.measures[0]
    if (!measure) {
      return 'bar 1'
    }
    const description = describePosition(
      analysis,
      measure.startQ + inputCursor.startQ,
    )
    return `bar ${measure.number} · ${description.countText}`
  }, [analysis, inputCursor])

  const staffCount = analysis?.staffCount ?? 1
  const staffControls = (
    <div
      className="toolbar-group staff-count-group"
      aria-label="Counting per staff"
    >
      <span className="toolbar-caption">Staves</span>
      {Array.from({ length: staffCount }, (_, index) => {
        const visible = staffVisibility[index] !== false
        return (
          <button
            key={index}
            type="button"
            className={`toolbar-button staff-toggle ${
              visible ? 'is-on' : ''
            }`}
            aria-pressed={visible}
            onClick={() =>
              setStaffVisibility((previous) => ({
                ...previous,
                [index]: previous[index] === false,
              }))
            }
            title={`Counting for staff ${index + 1}`}
          >
            S{index + 1}
          </button>
        )
      })}
    </div>
  )
  const totalMeasures = analysis?.measures.length ?? 0

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span>♪</span>
          </div>
          <div>
            <h1>
              Sightreading Rhythm Assistant
              <a
                className="version-pill"
                href="https://github.com/rayfoolshs/sightreading-rhythm-assistant/blob/main/CHANGELOG.md"
                target="_blank"
                rel="noreferrer"
                title="Version history"
              >
                v{__APP_VERSION__}
              </a>
            </h1>
            <p>Photograph it. Count it. Play it.</p>
            <div className="brand-byline">
              Created by Ray Foo ·{' '}
              <a
                href="https://www.rayfooproductions.com"
                target="_blank"
                rel="noreferrer"
              >
                www.rayfooproductions.com
              </a>
            </div>
          </div>
        </div>
        <div className="header-piece">
          <span className="header-piece-label">On the stand</span>
          <span className="header-piece-name">{scoreName}</span>
        </div>
      </header>

      <main className={`workspace ${editMode ? 'is-editing' : ''}`}>
        <Controls
          playing={playing}
          bpm={bpm}
          metronome={metronome}
          loop={loop}
          follow={follow}
          shuffle={shuffle}
          shuffleAmount={shuffleAmount}
          volume={volume}
          muted={muted}
          onToggle={handleToggle}
          onRestart={handleRestart}
          onBpm={changeTempo}
          onMetronome={changeMetronome}
          onLoop={(enabled) => {
            setLoop(enabled)
            player.setLoop(enabled)
          }}
          onFollow={setFollow}
          onShuffle={setShuffle}
          onShuffleAmount={setShuffleAmount}
          onVolume={setVolume}
          onMute={setMuted}
        />
        <section className="score-column">
          <div className="score-toolbar">
            {!editMode ? (
              <div className="toolbar-group">
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={handleEnterEdit}
                >
                  Edit score
                </button>
                <button
                  type="button"
                  className={`toolbar-button ${
                    countingStyle === 'kodaly' ? 'is-on' : ''
                  }`}
                  aria-pressed={countingStyle === 'kodaly'}
                  onClick={() =>
                    setCountingStyle((style) =>
                      style === 'numbers' ? 'kodaly' : 'numbers',
                    )
                  }
                  title="Show Kodály rhythm syllables under the notes"
                >
                  Kodály
                </button>
                {staffControls}
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={handlePrint}
                  title="Print the score"
                >
                  Print
                </button>
              </div>
            ) : (
              <>
                <div className="toolbar-group">
                  <span className="toolbar-status">Editing</span>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={handleUndo}
                    disabled={history.length === 0}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={handleRedo}
                    disabled={future.length === 0}
                  >
                    Redo
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={openXmlEditor}
                  >
                    MusicXML
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={handleRevert}
                  >
                    Revert
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={handleClearStaff}
                  >
                    Clear staff
                  </button>
                  <button
                    type="button"
                    className={`toolbar-button ${
                      countingStyle === 'kodaly' ? 'is-on' : ''
                    }`}
                    aria-pressed={countingStyle === 'kodaly'}
                    onClick={() =>
                      setCountingStyle((style) =>
                        style === 'numbers' ? 'kodaly' : 'numbers',
                      )
                    }
                    title="Show Kodály rhythm syllables under the notes"
                  >
                    Kodály
                  </button>
                </div>
                <div className="toolbar-group editor-transport">
                  <button
                    type="button"
                    className="toolbar-button transport-play"
                    onClick={handleToggle}
                  >
                    {playing ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={handleRestart}
                  >
                    Restart
                  </button>
                  <button
                    type="button"
                    className="toolbar-button tempo-step"
                    onClick={() => changeTempo(bpm - 5)}
                    aria-label="Slow down"
                  >
                    −
                  </button>
                  <span className="transport-tempo">{bpm} BPM</span>
                  <button
                    type="button"
                    className="toolbar-button tempo-step"
                    onClick={() => changeTempo(bpm + 5)}
                    aria-label="Speed up"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className={`toolbar-button ${metronome ? 'is-on' : ''}`}
                    aria-pressed={metronome}
                    onClick={() => changeMetronome(!metronome)}
                  >
                    Click
                  </button>
                </div>
                <button
                  type="button"
                  className="toolbar-button toolbar-done"
                  onClick={handleExitEdit}
                >
                  Done
                </button>
              </>
            )}
          </div>
          {editMode && (
            <NotationPalette
              selectedNote={selectedNote ?? null}
              inputEnabled={blankMode}
              pendingDuration={inputDuration}
              pendingDotted={inputDotted}
              pendingRest={inputRest}
              pendingAccidental={inputAccidental}
              meter={currentMeter}
              meterTarget={meterTarget}
              onNoteDuration={handleNoteDuration}
              onRestDuration={handleRestDuration}
              onDot={handleDot}
              onAccidental={handleAccidental}
              onNatural={handleNatural}
              onOctave={handleTranspose}
              onMeter={handleMeter}
            />
          )}
          <div className="score-card">
            <ScoreView
              ref={scoreRef}
              xml={scoreXml}
              follow={follow}
              countingStyle={countingStyle}
              visibleStaffs={staffVisibility}
              editMode={editMode}
              inputEnabled={blankMode && editMode}
              inputRest={inputRest}
              selections={selections}
              inputCursor={blankMode && editMode ? inputCursor : null}
              onSelectNote={handleSelectNote}
              onInputNote={handleInputNote}
              onAnalysis={handleAnalysis}
              onError={handleScoreError}
            />
          </div>
          {editMode && (
            <EditorPanel
              selectedNote={selectedNote ?? null}
              selection={selection}
              inputEnabled={blankMode}
              inputOctave={inputOctave}
              inputCursorLabel={inputCursorLabel}
              selectionCount={selections.length}
              error={editError}
              onPreview={handlePreview}
              onDelete={handleDeleteSelection}
            />
          )}
          {position ? (
            <CountDisplay
              position={position}
              totalMeasures={totalMeasures}
              playing={playing}
              bpm={bpm}
            />
          ) : (
            <section className="count-card count-card-placeholder">
              <div className="count-eyebrow">Counting</div>
              <div className="count-value">
                <span className="count-number">–</span>
              </div>
              <div className="count-meta">Waiting for a piece…</div>
            </section>
          )}
        </section>

        <aside className="side-column">
          <LoadPanel
            busy={busy}
            status={status}
            error={error}
            activeName={scoreName}
            omrAvailable={omrAvailable}
            onFile={handleFile}
            onDemo={handleDemo}
            onBlank={startBlankStaff}
            onRetryOmr={refreshOmr}
            onClearError={() => setError(null)}
          />
        </aside>
      </main>

      {xmlOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="MusicXML editor"
        >
          <div className="xml-modal">
            <div className="xml-modal-heading">
              <div>
                <span className="editor-eyebrow">Advanced</span>
                <h2>MusicXML editor</h2>
              </div>
              <p>
                Insert notes, fix chords, or repair rhythms by editing the
                source. Apply to re-engrave the score.
              </p>
            </div>
            <textarea
              className="xml-textarea"
              autoFocus
              value={xmlDraft}
              onChange={(event) => setXmlDraft(event.target.value)}
              spellCheck={false}
              aria-label="MusicXML source"
            />
            {xmlError && <div className="editor-error">{xmlError}</div>}
            <div className="xml-modal-actions">
              <button
                type="button"
                className="toolbar-button"
                onClick={downloadXml}
              >
                Download .musicxml
              </button>
              <div className="toolbar-group">
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => setXmlOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="toolbar-button toolbar-done"
                  onClick={applyXmlDraft}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <span>Photo OMR by Audiveris</span>
        <span>Notation by OpenSheetMusicDisplay</span>
        <span>
          Created by Ray Foo ·{' '}
          <a
            href="https://www.rayfooproductions.com"
            target="_blank"
            rel="noreferrer"
          >
            www.rayfooproductions.com
          </a>
        </span>
        <span>Space = play · ← → = nudge · Home = restart</span>
      </footer>
    </div>
  )
}

export default App
