import { loadLocale } from '../i18n'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { 'Accept-Language': loadLocale(), ...options.headers },
    })
  } catch (_error) {
    throw new ApiError('Could not reach the game server.', 0, 'NETWORK_ERROR')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code = payload && typeof payload.error === 'string' ? payload.error : 'REQUEST_FAILED'
    throw new ApiError(code, response.status, code)
  }
  if (!payload || typeof payload !== 'object') throw new ApiError('Invalid server response.', response.status, 'INVALID_RESPONSE')
  return payload
}

function post(path, body) {
  return request(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) })
}

export function getLeaderboards() {
  return request('/api/leaderboards')
}

export function getLeaderboard(gameId) {
  return request(`/api/leaderboards?gameId=${encodeURIComponent(gameId)}`)
}

export function startRun({ gameId, startLevel, startSpeed }) {
  return post('/api/runs', { gameId, startLevel, startSpeed })
}

export function finishRun(runId, { rulesVersion, totalTicks, actions }) {
  return post(`/api/runs/${encodeURIComponent(runId)}/finish`, { rulesVersion, totalTicks, actions })
}

export function claimRun(runId, { nickname, turnstileToken } = {}) {
  const body = { nickname }
  if (turnstileToken) body.turnstileToken = turnstileToken
  return post(`/api/runs/${encodeURIComponent(runId)}/claim`, body)
}
