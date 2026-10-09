export const initX = 18
export const initY = 4
export const initPaddleY = 3
const escapeArcs = [1, -1].flatMap(dy => [1, 2, 3].flatMap(period =>
  Array.from({ length: period }, (_, phase) => ({ dy, period, phase }))))

class Breakout {
  constructor({ x, y, dx, dy, bricks, paddleY, death, lateralPeriod, lateralPhase, dryPaddleHits }) {
    this.x = x
    this.y = y
    this.dx = dx || -1
    this.dy = dy || 1
    this.bricks = bricks || this.initBricks()
    this.paddleY = paddleY
    this.paddleLength = 3
    this.death = death || false
    this.lateralPeriod = lateralPeriod || 1
    this.lateralPhase = lateralPhase || 0
    this.dryPaddleHits = dryPaddleHits || 0
  }

  run() {
    // A shallow bounce advances sideways every other row. Unlike a permanent
    // 45-degree diagonal, this can reach both checkerboard parities of bricks.
    let lateral = this.lateralPhase === 0 ? this.dy : 0
    this.lateralPhase = (this.lateralPhase + 1) % this.lateralPeriod
    if (this.y + lateral > 9 || this.y + lateral < 0) {
      this.dy = -this.dy
      lateral = -lateral
    }
    if (this.x + this.dx < 0) {
      this.dx = -this.dx
    }
    if (this.x + this.dx > 18) {
      const impactY = this.y + lateral
      if (impactY >= this.paddleY && impactY < this.paddleY + this.paddleLength) {
        this.dx = -this.dx
        this.dryPaddleHits++
        const offset = impactY - (this.paddleY + 1)
        this.dy = offset === 0 ? this.dy : Math.sign(offset)
        this.lateralPeriod = offset === 0 ? 2 : 1
        this.lateralPhase = 0
        // After two empty returns, use a reachable outgoing angle when one
        // exists. Otherwise sweep angles so a fixed paddle cannot lock an
        // unbroken corridor into a short repeat cycle.
        if (this.dryPaddleHits >= 2) {
          const arc = this.aimAtRemainingBrick(impactY) ||
            escapeArcs[(this.dryPaddleHits - 2) % escapeArcs.length]
          this.dy = arc.dy
          this.lateralPeriod = arc.period
          this.lateralPhase = arc.phase
        }
      } else {
        this.death = true
      }
    }

    this.x = this.x + this.dx
    this.y = this.y + lateral
  }

  aimAtRemainingBrick(startY) {
    const bricks = new Set(this.bricks.map(([x, y]) => `${x},${y}`))
    return escapeArcs.find(({ dy: initialDy, period, phase: initialPhase }) => {
      let y = startY
      let dy = initialDy
      let phase = initialPhase
      // A paddle bounce leaves the ball on row 17. Search the outbound arc
      // through the brick rows; this is visual physics, not a direct hit.
      for (let x = 16; x >= 0; x--) {
        let lateral = phase === 0 ? dy : 0
        phase = (phase + 1) % period
        if (y + lateral < 0 || y + lateral > 9) {
          dy = -dy
          lateral = -lateral
        }
        y += lateral
        if (bricks.has(`${x},${y}`)) return true
      }
      return false
    })
  }

  move(type) {
    if (type === 'left' && this.paddleY > 0) {
      this.paddleY--
    } else if (type === 'right' && this.paddleY < 7) {
      this.paddleY++
    }
  }

  initBricks() {
    let breaks = []
    for (let c = 0; c <= 3; c++) {
      for (let r = 0; r<=9; r++) {
        breaks.push([c, r])
      }
    }
    return breaks
  }

  collisionDetection() {
    const flag =  this.bricks.some(brick => {
      return brick[0] === this.x && brick[1] === this.y
    })
    if (flag) {
      this.bricks = this.bricks.filter(brick => {
        return !(brick[0] === this.x && brick[1] === this.y)
      })
      if(this.bricks.length === 0) {
        this.death = true
      }
      this.dx = -this.dx
      this.dryPaddleHits = 0
    }
    return flag
  }

  toJsObj() {
    const { ...object } = this
    return object
  }
}

export const createNewBreakout = (obj) => {
  return new Breakout(obj)
}

export default Breakout
