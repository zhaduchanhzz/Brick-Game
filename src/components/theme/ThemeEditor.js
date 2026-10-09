import React from 'react'
import { COLOR_FIELDS, PRESETS, resolveTheme, themeContrastWarnings } from '../../theme/presets'
import style from './theme.module.less'

export default function ThemeEditor({ theme, onColorChange, onPresetChange, onReset }) {
  const resolved = resolveTheme(theme)
  const contrastWarnings = themeContrastWarnings(theme)

  return (
    <div className={style.editor}>
      <fieldset className={style.presetFieldset}>
        <legend>Choose a finish</legend>
        <div className={style.presets}>
          {PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={style.preset}
              aria-pressed={theme.presetId === preset.id}
              onClick={() => onPresetChange(preset.id)}
            >
              <span
                className={style.presetMachine}
                style={{
                  '--preview-case': preset.colors.case,
                  '--preview-border': preset.colors.border,
                  '--preview-lcd': preset.colors.lcd,
                  '--preview-button': preset.colors.buttonPrimary,
                }}
                aria-hidden="true"
              >
                <span className={style.presetScreen} />
                <span className={style.presetButton} />
              </span>
              <span className={style.presetName}>{preset.name}</span>
              <span className={style.presetSelected} aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={style.customFieldset}>
        <legend>Fine-tune the colors</legend>
        <p>Changes appear on the machine immediately and are saved on this device.</p>
        <div className={style.fields}>
          {COLOR_FIELDS.map(([key, label]) => (
            <label key={key} className={style.colorField}>
              <span>{label}</span>
              <span className={style.colorValue}>
                <input type="color" aria-label={label} value={resolved.colors[key]} onChange={event => onColorChange(key, event.target.value)} />
                <span aria-hidden="true">{resolved.colors[key]}</span>
              </span>
            </label>
          ))}
        </div>
        {contrastWarnings.length > 0 && (
          <div className={style.contrastWarning} role="status">
            {contrastWarnings.map(message => <p key={message}>{message}</p>)}
          </div>
        )}
      </fieldset>
      <button type="button" className={style.reset} onClick={onReset}>Reset to Classic Yellow</button>
    </div>
  )
}
