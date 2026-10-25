/**
 * Ask the local OMR backend whether it can read a photo right now.
 *
 * The server may spend several seconds in `docker info`, so the timeout here
 * has to be comfortably longer than the server-side probe (6s) or a cold
 * Docker daemon looks like an offline backend.
 */
export async function checkOmrHealth(timeoutMs = 12000): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('/api/health', { signal: controller.signal })
    if (!response.ok) {
      return false
    }
    const data = (await response.json()) as { ready?: boolean } | null
    return Boolean(data?.ready)
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}
