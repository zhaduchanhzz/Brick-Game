import React, { useLayoutEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import Decorate from '../decorate'
import Keyboard from '../keybord'
import Number from '../number'
import Music from '../music'
import Pause from '../pause'
import Welcome from '../welcome'
import TetrisPanel from '../tetris-panel'
import SnakePanel from '../snake-panel'
import ShootingPanel from '../shooting-panel'
import BreakoutPanel from '../breakout-panel'
import RacingPanel from '../rancing-panel'
import TankPanel from '../tank-panel'
import Logo from '../logo'
import style from './GameDevice.module.less'

const DEVICE_WIDTH = 640
const DEVICE_HEIGHT = 960

export default function GameDevice({ shape }) {
  const { levels, speed, music, pause, game, games } = useSelector(state => state)
  const stageRef = useRef(null)
  const [machine, setMachine] = useState({ scale: 1, height: DEVICE_HEIGHT })
  const gameId = games[game].name

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const portraitScreen = window.matchMedia('(orientation: portrait)')
    const resize = () => {
      const isTallShell = portraitScreen.matches
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight
      const spaceBelowStage = Math.max(0, viewportHeight - stage.getBoundingClientRect().top - 8)
      const availableHeight = Math.min(stage.clientHeight || spaceBelowStage, spaceBelowStage)
      const scale = Math.min(1, stage.clientWidth / DEVICE_WIDTH,
        isTallShell && availableHeight > 0 ? availableHeight / DEVICE_HEIGHT : 1)
      if (!window.Number.isFinite(scale) || scale <= 0) return
      const height = isTallShell
        ? Math.max(DEVICE_HEIGHT, Math.floor((availableHeight - 2) / scale))
        : DEVICE_HEIGHT
      setMachine(current => current.scale === scale && current.height === height
        ? current : { scale, height })
    }
    resize()
    window.addEventListener('resize', resize)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize)
    if (portraitScreen.addEventListener) portraitScreen.addEventListener('change', resize)
    let observer
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize)
      observer.observe(stage)
    }
    return () => {
      if (observer) observer.disconnect()
      window.removeEventListener('resize', resize)
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', resize)
      if (portraitScreen.removeEventListener) portraitScreen.removeEventListener('change', resize)
    }
  }, [])

  const extraHeight = Math.max(0, machine.height - DEVICE_HEIGHT)
  // Enlarge the LCD and every control by the same amount as a portrait shell
  // lengthens. Compact the keyboard's spacing below so it still fits its case.
  const contentScale = Math.min(1.15, 1 + extraHeight / DEVICE_HEIGHT * .35)
  const lcdHeight = shape === 'retro-e23' ? 484 : 478
  const lcdGrowth = lcdHeight * (contentScale - 1)
  const keyboardGrowth = 330 * (contentScale - 1)

  return (
    <div ref={stageRef} className={style.stage}>
      <div className={style.sized} style={{ width: DEVICE_WIDTH * machine.scale, height: machine.height * machine.scale }}>
        <div className={`${style.device} ${shape === 'retro-e23' ? style.retro : ''}`} style={{ height: machine.height, '--lcd-growth': `${lcdGrowth}px`, '--keyboard-growth': `${keyboardGrowth}px`, '--content-scale': contentScale, transform: `scale(${machine.scale})` }}>
          <div className={style.rect}>
            <Decorate retro={shape === 'retro-e23'} />
            <div className={style.screen}>
              <div className={style.panel}>
                {gameId === 'tetris' && <TetrisPanel />}
                {gameId === 'snake' && <SnakePanel />}
                {gameId === 'shooting' && <ShootingPanel />}
                {gameId === 'racing' && <RacingPanel />}
                {gameId === 'breakout' && <BreakoutPanel />}
                {gameId === 'tank' && <TankPanel />}
                {pause === 0 && <Welcome game={gameId.toUpperCase()} />}
                <div className={style.state}>
                  {pause === 0 ? <><p>HI-SCORE</p><Number number={games[game].highest} length={6} label="High score" /></> : <><p>SCORE</p><Number number={games[game].score} length={6} label="Score" /></>}
                  <p>LEVEL</p>
                  <Number number={levels} length={6} label="Level" />
                  <p>SPEED</p>
                  <Number number={speed} length={1} label="Speed" />
                  {pause === 0 && <Logo />}
                  <div className={style.bottom}>
                    <Music music={music} />
                    <Pause pause={pause} />
                    <Number time={true} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={style.controlsDock}><Keyboard filling={-16} scale={contentScale} /></div>
          {shape === 'retro-e23' && <div className={style.modelMark}>E-23 · 2 IN 1</div>}
        </div>
      </div>
    </div>
  )
}
