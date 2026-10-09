const listeners = new Set()
const VALID_MODES = new Set([
  'idle', 'ranked', 'casual', 'verifying', 'qualified', 'not-eligible',
  'verify-error', 'limit', 'claim-skipped', 'claimed',
])
let currentMode = { mode: 'idle' }

export function subscribeRunMode(listener) {
  listeners.add(listener)
  listener(currentMode)
  return () => listeners.delete(listener)
}

export function publishRunMode(nextMode) {
  if (!nextMode || !VALID_MODES.has(nextMode.mode)) return
  currentMode = { mode: nextMode.mode, reason: typeof nextMode.reason === 'string' ? nextMode.reason : undefined }
  listeners.forEach(listener => listener(currentMode))
}
