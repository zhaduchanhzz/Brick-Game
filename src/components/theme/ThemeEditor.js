import React from 'react'
import { COLOR_FIELDS, PRESETS, resolveTheme, themeContrastWarningCodes } from '../../theme/presets'
import { useI18n } from '../../i18n'
import style from './theme.module.less'

export default function ThemeEditor({ theme, onColorChange, onPresetChange, onReset }) {
  const { t } = useI18n()
  const resolved = resolveTheme(theme)
  const contrastWarnings = themeContrastWarningCodes(theme)

  return (
    <div className={style.editor}>
      <fieldset className={style.presetFieldset}>
        <legend>{t('theme.chooseFinish')}</legend>
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
              <span className={style.presetName}>{t(`theme.preset.${preset.id}`)}</span>
              <span className={style.presetSelected} aria-hidden="true">✓</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={style.customFieldset}>
        <legend>{t('theme.fineTune')}</legend>
        <p>{t('theme.savedLocally')}</p>
        <div className={style.fields}>
          {COLOR_FIELDS.map(([key]) => (
            <label key={key} className={style.colorField}>
              <span>{t(`theme.color.${key}`)}</span>
              <span className={style.colorValue}>
                <input type="color" aria-label={t(`theme.color.${key}`)} value={resolved.colors[key]} onChange={event => onColorChange(key, event.target.value)} />
                <span aria-hidden="true">{resolved.colors[key]}</span>
              </span>
            </label>
          ))}
        </div>
        {contrastWarnings.length > 0 && (
          <div className={style.contrastWarning} role="status">
            {contrastWarnings.map(code => <p key={code}>{t(`theme.warning.${code}`)}</p>)}
          </div>
        )}
      </fieldset>
      <button type="button" className={style.reset} onClick={onReset}>{t('theme.reset')}</button>
    </div>
  )
}
