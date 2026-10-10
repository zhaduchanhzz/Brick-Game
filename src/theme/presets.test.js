import { DEFAULT_PRESET_ID, PRESETS, THEME_STORAGE_KEY, THEME_STORAGE_VERSION, contrastRatio, loadTheme, resolveTheme, sanitizeTheme, saveTheme, themeContrastWarningCodes, themeContrastWarnings, themeVariables } from './presets'

describe('theme settings', () => {
  beforeEach(() => window.localStorage.clear())

  test('all six presets exist and E-23 has a distinct shape', () => {
    expect(PRESETS).toHaveLength(6)
    expect(PRESETS.find(preset => preset.id === 'retro-cream').shape).toBe('retro-e23')
    expect(PRESETS.filter(preset => preset.shape === 'modern')).toHaveLength(5)
  })

  test('valid colors persist while CSS injection and unknown fields are dropped', () => {
    saveTheme({ version: THEME_STORAGE_VERSION, presetId: 'ocean-blue', overrides: { case: '#aBc123', lcd: 'red; background:url(evil)', backgroundImage: 'url(evil)' } })
    expect(loadTheme()).toEqual({ version: THEME_STORAGE_VERSION, presetId: 'ocean-blue', overrides: { case: '#ABC123' } })
    expect(themeVariables(loadTheme())['--case-color']).toBe('#ABC123')
    expect(resolveTheme(loadTheme()).shape).toBe('modern')
  })

  test('invalid storage falls back to the default preset', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, '{not json')
    expect(loadTheme().presetId).toBe(DEFAULT_PRESET_ID)
    expect(sanitizeTheme({ version: 1, presetId: 'invalid', overrides: { case: '#123456' } }).presetId).toBe(DEFAULT_PRESET_ID)
  })

  test('warns when custom colors make text or LCD pixels unreadable', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1)
    expect(PRESETS.map(preset => [preset.id, themeContrastWarnings({ version: 1, presetId: preset.id, overrides: {} })])).toEqual(PRESETS.map(preset => [preset.id, []]))
    const warnings = themeContrastWarnings({ version: 1, presetId: 'classic-yellow', overrides: { case: '#FFFFFF', label: '#FFFFFF', lcd: '#FFFFFF', lcdPixel: '#FFFFFF', pageBackground: '#FFFFFF' } })
    expect(warnings).toHaveLength(3)
    expect(themeContrastWarningCodes({ version: 1, presetId: 'classic-yellow', overrides: { case: '#FFFFFF', label: '#FFFFFF', lcd: '#FFFFFF', lcdPixel: '#FFFFFF', pageBackground: '#FFFFFF' } })).toEqual(['machineText', 'lcdPixels', 'pageText'])
  })
})
