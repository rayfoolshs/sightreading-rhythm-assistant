import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Keeps an OSMD or editor failure from blanking the whole page. The score is
 * re-engraved from state, so reloading is enough to recover.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unexpected application error', error, info)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) {
      return this.props.children
    }
    return (
      <div className="app-fallback" role="alert">
        <h1>Something went wrong</h1>
        <p>
          The score could not be drawn. Reloading usually clears it. If it
          keeps happening, the MusicXML may contain something the engraver
          cannot read.
        </p>
        <pre>{error.message}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Reload the app
        </button>
      </div>
    )
  }
}
