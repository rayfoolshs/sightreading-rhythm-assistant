import type { EditableNote } from '../music/musicxmlEditor'
import { noteNameFromMidi } from '../music/musicxmlEditor'
import type { NoteSelection } from '../music/types'

interface EditorPanelProps {
  selectedNote: EditableNote | null
  selection: NoteSelection | null
  inputEnabled: boolean
  inputOctave: number
  inputCursorLabel: string
  selectionCount: number
  error: string | null
  onPreview: () => void
  onDelete: () => void
}

export function EditorPanel({
  selectedNote,
  selection,
  inputEnabled,
  inputOctave,
  inputCursorLabel,
  selectionCount,
  error,
  onPreview,
  onDelete,
}: EditorPanelProps) {
  return (
    <section className="editor-panel">
      <div className="editor-heading">
        <div>
          <span className="editor-eyebrow">Notation editor</span>
          <h2>Fix the score</h2>
        </div>
        {selectedNote && (
          <div className="editor-note-badge">
            <strong>
              {selectedNote.isRest
                ? 'Rest'
                : noteNameFromMidi(selectedNote.midi ?? 60)}
            </strong>
            <span>
              {selectedNote.type || 'note'}
              {selectedNote.dots > 0 ? ' ·'.repeat(selectedNote.dots) : ''}
            </span>
          </div>
        )}
      </div>

      {!selectedNote ? (
        <p className="editor-empty">
          {selection
            ? 'This edit could not be matched to a note. Undo or reopen the piece.'
            : inputEnabled
              ? 'Click anywhere on the empty staff to write a note. Choose a note value, dot, accidental or rest in the palette first.'
              : 'Click a notehead or rest in the score, then use the notation palette above to change pitch, note value, dot or rest.'}
        </p>
      ) : (
        <div className="editor-selected-row">
          <p>
            {selectionCount > 1
              ? `${selectionCount} notes selected. Press Delete / ⌫ to remove the range.`
              : 'Use the palette to change pitch, note value, dot, rest or octave.'}
          </p>
          <div className="editor-button-row">
            <button
              type="button"
              className="editor-button"
              onClick={onPreview}
              disabled={selectedNote.isRest || selectionCount > 1}
            >
              Preview pitch
            </button>
            <button
              type="button"
              className="editor-button danger"
              onClick={onDelete}
              aria-keyshortcuts="Delete Backspace"
              title="Delete the selected note or range (Delete or Backspace)"
            >
              Delete {selectionCount > 1 ? `${selectionCount} notes` : 'note'}{' '}
              <kbd className="editor-kbd">Del / ⌫</kbd>
            </button>
          </div>
        </div>
      )}

      {inputEnabled && (
        <div className="input-status">
          <div className="input-status-line">
            <span className="input-status-label">Keyboard input</span>
            <strong>
              Octave {inputOctave} · {inputCursorLabel}
            </strong>
          </div>
          <div className="input-status-hint">
            A–G note · Z/X octave · 1–5 length · Shift+1–5 rest · ←/→ navigate
            &amp; play · ↑/↓ pitch · Shift+←/→ move · Delete / ⌫ removes
          </div>
        </div>
      )}

      {error && <div className="editor-error">{error}</div>}
      <p className="editor-hint">
        Duration changes move the next note to keep the bar full. The meter
        control applies from the selected bar, or to the whole staff on a blank
        page. Deleting a note is the same as making it a rest, so the timing
        stays intact.
      </p>
      <p className="editor-shortcuts">
        Click a notehead to select · Shift-click for a range · ←/→ audition ·
        ↑/↓ pitch · Shift+arrows edit · Delete / ⌫ removes
      </p>
    </section>
  )
}
