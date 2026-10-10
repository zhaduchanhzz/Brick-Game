const listeners = new Set()

export function publishKeyboardFeedback(type, pressed) {
  listeners.forEach(listener => listener(type, pressed))
}

export function subscribeKeyboardFeedback(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
