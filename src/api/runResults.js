const listeners = new Set()

export function subscribeVerifiedRun(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Call only with a successful /finish response. A local score never opens the claim UI.
export function publishVerifiedRun(result) {
  if (!result || result.verified !== true || typeof result.runId !== 'string' || typeof result.gameId !== 'string') return
  listeners.forEach(listener => listener(result))
}
