import React from 'react'
import style from './index.module.less'
import Button from './button'
import PropTypes from 'prop-types'
import { useI18n } from '../../i18n'

const Keyboard = ({ filling, scale = 1, keyboardMode = 'arrows' }) => {
  const { t } = useI18n()
  // The right-hand buttons move inward as their circles grow. This preserves
  // their spacing while keeping the full keyboard inside a narrow case.
  const compact = Math.max(0, Math.min(1, (scale - 1) / .15))
  return (
    <div
      className={style.keyboard}
      style={{
        marginTop: 20 + filling,
        transform: `translateX(${23 * compact * scale}px) scale(${scale})`
      }}
    >
      <div className={style.left}>
        <Button
          color="blue"
          size="s1"
          top={0}
          left={98}
          label={t('device.quick')}
          arrow="translate(0, 63px)"
          position
          type="up"
        />
        <Button
          color="blue"
          size="s1"
          top={180}
          left={98}
          label={t('device.down')}
          arrow="translate(0,-71px) rotate(180deg)"
          type="down"
        />
        <Button
          color="blue"
          size="s1"
          top={90}
          left={6}
          label={t('device.left')}
          arrow="translate(60px, -12px) rotate(270deg)"
          type="left"
        />
        <Button
          color="blue"
          size="s1"
          top={90}
          left={188}
          label={t('device.right')}
          arrow="translate(-60px, -12px) rotate(90deg)"
          type="right"
        />
      </div>

      <Button
        color="blue"
        size="s0"
        top={100}
        left={380 - 40 * compact}
        label={t('device.rotate')}
        type="rotate"
      />
      <Button
        color="red"
        size="s2"
        top={0}
        left={508 - 60 * compact}
        label={t('device.reset')}
        type="r"
      />
      <Button
        color="green"
        size="s2"
        top={0}
        left={420 - 60 * compact}
        label={t('device.sound', { key: keyboardMode === 'wasd' ? 'M' : 'S' })}
        type="s"
      />
      <Button
        color="green"
        size="s2"
        top={0}
        left={332 - 60 * compact}
        label={t('device.start')}
        type="p"
      />
    </div>
  )
}

Keyboard.propTypes = {
  filling: PropTypes.number.isRequired,
  scale: PropTypes.number,
  keyboardMode: PropTypes.oneOf(['arrows', 'wasd']),
}

export default Keyboard
