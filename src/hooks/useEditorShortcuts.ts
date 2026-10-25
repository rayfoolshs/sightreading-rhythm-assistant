import { useEffect } from 'react'
import type { NoteSelection } from '../music/types'

interface EditorShortcutOptions {
  editMode: boolean
  blankMode: boolean
  selection: NoteSelection | null
  selections: NoteSelection[]
  onDeleteSelection: () => void
  onMovePitch: (semitones: number) => void
  onMoveTime: (deltaQ: number) => void
  onNavigate: (direction: number) => void
  onNoteDuration: (value: number) => void
  onRestDuration: (value: number) => void
  onTranspose: (semitones: number) => void
  onDot: () => void
  insertKeyboardNote: (letter: string) => void
  insertRestAtCursor: (duration?: number) => void
  setInputDuration: (value: number) => void
  setInputRest: (value: boolean) => void
  setInputOctave: (updater: (previous: number) => number) => void
}

/**
 * Notation-editor keys: delete/backspace, pitch and time movement, note
 * values, keyboard note entry, octave switching and dots.
 */
export function useEditorShortcuts(options: EditorShortcutOptions): void {
  const {
    editMode,
    blankMode,
    selection,
    selections,
    onDeleteSelection,
    onMovePitch,
    onMoveTime,
    onNavigate,
    onNoteDuration,
    onRestDuration,
    onTranspose,
    onDot,
    insertKeyboardNote,
    insertRestAtCursor,
    setInputDuration,
    setInputRest,
    setInputOctave,
  } = options

  useEffect(() => {
    if (!editMode) {
      return
    }
    const durations: Record<string, number> = {
      '1': 4,
      '2': 2,
      '3': 1,
      '4': 0.5,
      '5': 0.25,
    }
    const noteLetters = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return
      }

      if (
        event.key === 'Delete' ||
        event.key === 'Del' ||
        event.key === 'Backspace' ||
        event.code === 'Delete' ||
        event.code === 'Backspace'
      ) {
        // Backspace is the main delete key on Mac keyboards; both delete the
        // selection, and both are prevented from navigating the page.
        event.preventDefault()
        if (selections.length > 0) {
          onDeleteSelection()
        }
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (!selection) {
          return
        }
        event.preventDefault()
        const direction = event.key === 'ArrowUp' ? 1 : -1
        onMovePitch(direction * (event.shiftKey ? 12 : 1))
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const direction = event.key === 'ArrowRight' ? 1 : -1
        if (event.shiftKey) {
          if (!selection) {
            return
          }
          onMoveTime(direction * 1)
        } else {
          onNavigate(direction)
        }
        return
      }

      const digit = event.code.match(/^(?:Digit|Numpad)([1-5])$/)?.[1]
      if (digit) {
        event.preventDefault()
        const value = durations[digit]
        if (event.shiftKey) {
          setInputDuration(value)
          setInputRest(true)
          if (blankMode) {
            insertRestAtCursor(value)
          } else {
            onRestDuration(value)
          }
        } else if (blankMode) {
          setInputDuration(value)
          setInputRest(false)
        } else {
          onNoteDuration(value)
        }
        return
      }

      const key = event.key.toLowerCase()
      if (blankMode && noteLetters.has(key)) {
        event.preventDefault()
        insertKeyboardNote(key)
        return
      }
      if (key === 'z' || key === 'x') {
        event.preventDefault()
        const direction = key === 'z' ? -1 : 1
        if (blankMode) {
          setInputOctave((previous) =>
            Math.max(2, Math.min(6, previous + direction)),
          )
        } else if (selection) {
          onTranspose(direction * 12)
        }
        return
      }
      if (event.key === '.') {
        event.preventDefault()
        onDot()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    blankMode,
    editMode,
    insertKeyboardNote,
    insertRestAtCursor,
    onDeleteSelection,
    onDot,
    onMovePitch,
    onMoveTime,
    onNavigate,
    onNoteDuration,
    onRestDuration,
    onTranspose,
    selection,
    selections,
    setInputDuration,
    setInputOctave,
    setInputRest,
  ])
}
