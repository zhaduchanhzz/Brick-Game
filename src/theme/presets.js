export const THEME_STORAGE_KEY = 'brick-game-theme'
export const THEME_STORAGE_VERSION = 1
export const DEFAULT_PRESET_ID = 'classic-yellow'

export const COLOR_FIELDS = [
  ['case', 'Machine body'],
  ['border', 'Machine border'],
  ['lcd', 'LCD screen'],
  ['lcdPixel', 'LCD pixels'],
  ['lcdBezel', 'LCD bezel'],
  ['buttonPrimary', 'Main button'],
  ['buttonSecondary', 'Direction buttons'],
  ['label', 'Machine text'],
  ['accent', 'Accent'],
  ['pageBackground', 'Page background'],
]

export const PRESETS = [
  {
    id: 'classic-yellow', name: 'Classic Yellow', shape: 'modern',
    colors: { case: '#EFCC19', border: '#40330D', lcd: '#9EAD86', lcdPixel: '#152419', lcdBezel: '#F8DE58', buttonPrimary: '#D93332', buttonSecondary: '#4759D4', label: '#211C10', accent: '#FFF6AE', pageBackground: '#17243B' },
  },
  {
    id: 'neon-green', name: 'Neon Green', shape: 'modern',
    colors: { case: '#22DD38', border: '#123D1C', lcd: '#A9B995', lcdPixel: '#152419', lcdBezel: '#B5D3A8', buttonPrimary: '#F9EB18', buttonSecondary: '#20C7EE', label: '#102613', accent: '#71FF80', pageBackground: '#153B55' },
  },
  {
    id: 'ocean-blue', name: 'Ocean Blue', shape: 'modern',
    colors: { case: '#2168BE', border: '#12355E', lcd: '#B5C8B5', lcdPixel: '#1B3440', lcdBezel: '#9CD8E6', buttonPrimary: '#F1CA2A', buttonSecondary: '#74D4EC', label: '#F8FCFF', accent: '#8FE7FA', pageBackground: '#10283E' },
  },
  {
    id: 'midnight-black', name: 'Midnight Black', shape: 'modern',
    colors: { case: '#252B35', border: '#07090D', lcd: '#9FB5A4', lcdPixel: '#10221D', lcdBezel: '#566772', buttonPrimary: '#F1A545', buttonSecondary: '#758BE1', label: '#F7F7EE', accent: '#D5E5F4', pageBackground: '#101722' },
  },
  {
    id: 'hot-pink', name: 'Hot Pink', shape: 'modern',
    colors: { case: '#E958A9', border: '#78315E', lcd: '#AEC8AA', lcdPixel: '#263624', lcdBezel: '#FFC6E7', buttonPrimary: '#F9CE46', buttonSecondary: '#7C6CDD', label: '#351529', accent: '#FFE8F6', pageBackground: '#3F1837' },
  },
  {
    id: 'retro-cream', name: 'Retro Cream E-23', shape: 'retro-e23',
    colors: { case: '#E8DEC0', border: '#8A7045', lcd: '#AAB693', lcdPixel: '#253124', lcdBezel: '#D2AA42', buttonPrimary: '#D9AC37', buttonSecondary: '#D3A842', label: '#554A2E', accent: '#FFF5D5', pageBackground: '#394347' },
  },
]

const PRESET_BY_ID = Object.fromEntries(PRESETS.map(preset => [preset.id, preset]))
const COLOR_KEYS = new Set(COLOR_FIELDS.map(([key]) => key))
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

export function sanitizeTheme(value) {
  const presetId = value && PRESET_BY_ID[value.presetId] ? value.presetId : DEFAULT_PRESET_ID
  const overrides = {}
  if (value && value.version === THEME_STORAGE_VERSION && value.overrides && typeof value.overrides === 'object') {
    Object.entries(value.overrides).forEach(([key, color]) => {
      if (COLOR_KEYS.has(key) && isHexColor(color)) overrides[key] = color.toUpperCase()
    })
  }
  return { version: THEME_STORAGE_VERSION, presetId, overrides }
}

export function loadTheme() {
  try {
    return sanitizeTheme(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY)))
  } catch (_error) {
    return sanitizeTheme(null)
  }
}

export function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(sanitizeTheme(theme)))
  } catch (_error) {
    // Theme changes remain usable when storage is disabled.
  }
}

export function resolveTheme(theme) {
  const safe = sanitizeTheme(theme)
  const preset = PRESET_BY_ID[safe.presetId]
  return { ...preset, colors: { ...preset.colors, ...safe.overrides } }
}

export function themeVariables(theme) {
  const colors = resolveTheme(theme).colors
  return {
    '--case-color': colors.case,
    '--border-color': colors.border,
    '--lcd-color': colors.lcd,
    '--lcd-pixel-color': colors.lcdPixel,
    '--lcd-bezel-color': colors.lcdBezel,
    '--button-primary-color': colors.buttonPrimary,
    '--button-secondary-color': colors.buttonSecondary,
    '--label-color': colors.label,
    '--accent-color': colors.accent,
    '--page-background-color': colors.pageBackground,
  }
}

export function contrastRatio(first, second) {
  if (!isHexColor(first) || !isHexColor(second)) return 0
  const luminance = color => {
    const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
    const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const brighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (brighter + 0.05) / (darker + 0.05)
}

export function themeContrastWarningCodes(theme) {
  const colors = resolveTheme(theme).colors
  const warnings = []
  if (contrastRatio(colors.case, colors.label) < 4.5) warnings.push('machineText')
  if (contrastRatio(colors.lcd, colors.lcdPixel) < 4.5) warnings.push('lcdPixels')
  if (contrastRatio(colors.pageBackground, '#F2F7FB') < 4.5) warnings.push('pageText')
  return warnings
}

export function themeContrastWarnings(theme) {
  const messages = {
    machineText: 'Machine text may be hard to read against the body color.',
    lcdPixels: 'LCD pixels may be hard to see against the screen color.',
    pageText: 'Page text may be hard to read against the background color.',
  }
  return themeContrastWarningCodes(theme).map(code => messages[code])
}
