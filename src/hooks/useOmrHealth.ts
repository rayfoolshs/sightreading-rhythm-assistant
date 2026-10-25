import { useCallback, useEffect, useState } from 'react'
import { checkOmrHealth } from '../api/omr'

/**
 * Tracks whether the local OMR backend is reachable. Photo uploads re-check
 * before failing, so starting the server after the page loads still works.
 */
export function useOmrHealth() {
  const [omrAvailable, setOmrAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void checkOmrHealth().then((ready) => {
      if (!cancelled) {
        setOmrAvailable(ready)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const probe = useCallback(async () => {
    setOmrAvailable(null)
    const ready = await checkOmrHealth()
    setOmrAvailable(ready)
    return ready
  }, [])

  const refresh = useCallback(async () => {
    await probe()
  }, [probe])

  return { omrAvailable, refresh, probe }
}
