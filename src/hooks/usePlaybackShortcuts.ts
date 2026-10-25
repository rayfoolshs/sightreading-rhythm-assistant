import { useEffect } from 'react'
import type { Player } from '../music/player'

interface PlaybackShortcutOptions {
  editMode: boolean
  player: Player
  onToggle: () => void
  onRestart: () => void
}

/** Space = play/pause, Home = restart, arrows = nudge outside edit mode. */
export function usePlaybackShortcuts({
  editMode,
  player,
  onToggle,
  onRestart,
}: PlaybackShortcutOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        onToggle()
      } else if (event.key === 'Home') {
        event.preventDefault()
        onRestart()
      } else if (event.key === 'ArrowLeft' && !editMode) {
        event.preventDefault()
        player.seek(Math.max(0, player.currentQ() - 1))
      } else if (event.key === 'ArrowRight' && !editMode) {
        event.preventDefault()
        player.seek(player.currentQ() + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editMode, onRestart, onToggle, player])
}
