import { useRef, useState } from 'react'
import { demoPieces } from '../music/demo'

interface LoadPanelProps {
  busy: boolean
  status: string
  error: string | null
  activeName: string
  onFile: (file: File) => void
  onDemo: (id: string) => void
  onClearError: () => void
}

export function LoadPanel({
  busy,
  status,
  error,
  activeName,
  onFile,
  onDemo,
  onClearError,
}: LoadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) {
      onFile(file)
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Load a piece</h2>
        <span className="panel-tag">photo or MusicXML</span>
      </div>

      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${
          busy ? 'is-busy' : ''
        }`}
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !busy) {
            event.preventDefault()
            event.stopPropagation()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!busy) {
            handleFiles(event.dataTransfer.files)
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.xml,.musicxml"
          hidden
          onChange={(event) => {
            handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <div className="dropzone-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" role="presentation">
            <rect x="7" y="5" width="34" height="38" rx="5" />
            <path d="M15 16h18M15 23h18M15 30h11" />
            <circle cx="31" cy="34" r="3.2" />
            <path d="M34.2 34V26l4-1.2" />
          </svg>
        </div>
        <div className="dropzone-title">
          {busy ? 'Reading your sheet music…' : 'Snap a photo of a short piece'}
        </div>
        <div className="dropzone-hint">
          {busy
            ? 'Audiveris is converting it to MusicXML. This can take a minute.'
            : 'JPG, PNG, HEIC, PDF, .xml or .musicxml · drag and drop or click'}
        </div>
        {!busy && <span className="dropzone-action">Choose a file</span>}
        {busy && <span className="spinner dropzone-spinner" />}
      </div>

      {busy && <div className="inline-status">{status}</div>}

      {error && (
        <div className="inline-error" role="alert">
          <div>{error}</div>
          <button type="button" onClick={onClearError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="demo-heading">
        <span>Or try a sample</span>
        <span className="rule" />
      </div>
      <div className="demo-list">
        {demoPieces.map((demo) => (
          <button
            key={demo.id}
            type="button"
            className={`demo-item ${activeName === demo.name ? 'is-active' : ''}`}
            onClick={() => onDemo(demo.id)}
          >
            <span className="demo-name">{demo.name}</span>
            <span className="demo-meta">{demo.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
