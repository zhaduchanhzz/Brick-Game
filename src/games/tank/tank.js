/* eslint-disable no-unused-vars */
import { copyData } from '../../utils/helps'
import { blankMatrix } from '../tetris/tetris'
import { enemyShape, generateEnemy, initPos } from './enemy'
const playerShape = { up:[[0, 1, 0],
  [1, 1, 1],
  [1, 1, 1]],down:[[1, 1, 1],
  [1, 1, 1],
  [0, 1, 0]],left:[[0, 1, 1],
  [1, 1, 1],
  [0, 1, 1]],right:[[1, 1, 0],
  [1, 1, 1],
  [1, 1, 0]] }

class Tank {
  constructor({ matrix, enemiesBullets, player, enemies, stones, death, direction, bullet, score, rng = Math.random }) {
    Object.defineProperty(this, 'rng', { value: rng })
    this.player = player || [15, 4]
    this.enemies = enemies || []
    this.direction = direction || 'up'
    this.stones = stones || this.initStones()
    this.death = death || false
    this.bullet = bullet || null
    this.enemiesBullets = enemiesBullets || []
    this.score = score || 0
    this.draw()
  }

  addEnemy() {
    if (this.enemies.length < 3) {
      const xy = this.randomEnemyPos()
      if (xy) this.enemies = this.enemies.concat(generateEnemy({ direction: this.randomEnemyDirection(), xy }))
    }
  }

  randomEnemyDirection(){
    const idx = Math.floor(this.rng()*4)
    let res
    switch(idx) {
    case 0: res = 'up';break
    case 1: res = 'down'; break
    case 2: res = 'left'; break
    case 3: res = 'right'; break
    }
    return res
  }

  randomEnemyPos() {
    const available = []
    for (let x = 0; x <= 17; x++) {
      for (let y = 0; y <= 7; y++) {
        let free = true
        for (let row = x; row < x + 3 && free; row++) {
          for (let col = y; col < y + 3; col++) {
            if (this.matrix[row][col]) {
              free = false
              break
            }
          }
        }
        if (free) available.push([x, y])
      }
    }
    return available.length ? available[Math.floor(this.rng() * available.length)] : null
  }

  run() {
    const add = this.rng() > 0.6
    if (add) {
      this.addEnemy()
    }
    this.enemiesMove()
    // this.enemiesFire()
  }

  enemiesMove() {
    const claimed = new Set()
    this.enemies = this.enemies.map((enemy) => {
      const newEnemy = Object.assign({}, enemy)
      const nextXy = this.getNextXy(enemy.xy, enemy.direction)
      const canOccupy = (positions) => {
        const own = new Set(enemy.position.map(([x, y]) => `${x},${y}`))
        return positions.every(([x, y]) => x >= 0 && x < 20 && y >= 0 && y < 10 &&
          (own.has(`${x},${y}`) || !this.matrix[x][y]) && !claimed.has(`${x},${y}`))
      }
      const nextPosition = initPos(enemy.shape, nextXy)
      if (canOccupy(nextPosition)) {
        newEnemy.xy = nextXy
        newEnemy.position = nextPosition
      } else {
        const direction = this.randomEnemyDirection()
        const shape = enemyShape[direction]
        const position = initPos(shape, enemy.xy)
        if (canOccupy(position)) {
          newEnemy.direction = direction
          newEnemy.shape = shape
          newEnemy.position = position
        }
      }
      newEnemy.position.forEach(([x, y]) => claimed.add(`${x},${y}`))
      return newEnemy
    })
  }
  enemiesFire() {
    const enemy = this.enemies[Math.floor(this.rng()*this.enemies.length)]
    if(!enemy) return
    let pos
    switch(enemy.direction) {
    case 'up': {
      pos = [enemy.xy[0]-1, enemy.xy[1]+1]
      break
    }
    case 'down': {
      pos = [enemy.xy[0]+3, enemy.xy[1]+1]
      break
    }
    case 'left': {
      pos = [enemy.xy[0]+1, enemy.xy[1]-1]
      break
    }
    case 'right': {
      pos = [enemy.xy[0]+1, enemy.xy[1]+3]
      break
    }
    }
    this.enemiesBullets = this.enemiesBullets.concat({ direction: enemy.direction, pos })
    this.enemiesBullets = this.enemiesBullets.filter(bullet => !(bullet.pos[0]<0 || bullet.pos[0] >19 ||
        bullet.pos[1]<0 || bullet.pos[1] > 9))

  }

  runEnemiesBullet() {
    this.enemiesBullets = this.enemiesBullets.map(bullet => {
      const pos = [...bullet.pos]
      switch(bullet.direction) {
      case 'up': {
        pos[0]--
        break
      }
      case 'down': {
        pos[0]++
        break
      }
      case 'left': {
        pos[1]--
        break
      }
      case 'right': {
        pos[1]++
        break
      }
      }
      return { ...bullet, pos }
    })
    //remove bullet which out of matrix
    this.enemiesBullets = this.enemiesBullets.filter(bullet => !(bullet.pos[0]<0 || bullet.pos[0] >19 ||
        bullet.pos[1]<0 || bullet.pos[1] > 9))
  }

  initStones() {
    const playerPositions = new Set()
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) playerPositions.add(`${this.player[0] + i},${this.player[1] + j}`)
    }
    const available = []
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 10; y++) {
        const corner = (x === 0 || x === 19) && (y === 0 || y === 9)
        if (!corner && !playerPositions.has(`${x},${y}`)) available.push([x, y])
      }
    }
    const stones = []
    for (let i = 0; i < 3; i++) {
      stones.push(available.splice(Math.floor(this.rng() * available.length), 1)[0])
    }
    return stones
  }

  draw() {
    let matrix = copyData(blankMatrix)

    this.enemiesBullets = this.enemiesBullets.filter(bullet =>
      !this.stones.some(stone => stone[0] === bullet.pos[0] && stone[1] === bullet.pos[1]))
    this.shootingDetection()
    this.shootedPlayerDetection()
    //draw stone
    this.stones.forEach(stone => {
      matrix[stone[0]][stone[1]] = 1
    })

    // draw enemies
    this.enemies.forEach((enemy) => {enemy.position.forEach((pos) => {
      matrix[pos[0]][pos[1]] = 1
    })})

    //draw player
    playerShape[this.direction].forEach((m, k1) => {
      m.forEach((n, k2) => {
        if (n) {
          matrix[k1+this.player[0]][k2+this.player[1]] = n
        }
      })
    })

    //draw fire
    this.stopFire()
    if (this.bullet) {
      matrix[this.bullet.pos[0]][this.bullet.pos[1]] = 2
    }
    //draw enemy fire
    if (this.enemiesBullets.length>0) {
      this.enemiesBullets.forEach(bullet => {
        matrix[bullet.pos[0]][bullet.pos[1]] = 3
      })
    }
    this.matrix = matrix
  }

  shootingDetection() {
    if (this.bullet === null) {
      return
    }
    //射中石头
    const shootedStone = this.stones.some(stone => stone[0] === this.bullet.pos[0] && stone[1] === this.bullet.pos[1])
    if (shootedStone) {
      this.stones = this.stones.filter(stone => !(stone[0] === this.bullet.pos[0] && stone[1] === this.bullet.pos[1]))
      this.bullet = null
      this.score += 100
    }

    if (this.bullet === null) {
      return
    }
    //射中敌人
    const shootedEnemy = this.enemies.some(enemy => enemy.position.some(pos => pos[0] === this.bullet.pos[0] && pos[1] === this.bullet.pos[1]))
    if (shootedEnemy) {
      this.enemies = this.enemies.filter(enemy => !enemy.position.some(pos => pos[0] === this.bullet.pos[0] && pos[1] === this.bullet.pos[1]))
      this.bullet = null
      this.score += 200
    }
  }

  shootedPlayerDetection() {
    let positions = []
    playerShape[this.direction].forEach((m, k1) => {
      m.forEach((n, k2) => {
        if (n) {
          positions.push([this.player[0]+k1, this.player[1]+k2])
        }
      })
    })
    //敌人射中玩家
    this.enemiesBullets.forEach(bullet => {
      const shooted = positions.some(pos => pos[0] === bullet.pos[0] && pos[1] === bullet.pos[1])
      if(shooted) {
        this.death = true
      }
    })
  }

  fire() {
    if (this.bullet === null) {
      let pos
      switch(this.direction) {
      case 'up': {
        pos = [this.player[0]-1, this.player[1]+1]
        break
      }
      case 'down': {
        pos = [this.player[0]+3, this.player[1]+1]
        break
      }
      case 'left': {
        pos = [this.player[0]+1, this.player[1]-1]
        break
      }
      case 'right': {
        pos = [this.player[0]+1, this.player[1]+3]
        break
      }
      }
      this.bullet = { direction: this.direction, pos }
    } else {
      const pos = [...this.bullet.pos]
      switch(this.bullet.direction) {
      case 'up': {
        pos[0]--
        break
      }
      case 'down': {
        pos[0]++
        break
      }
      case 'left': {
        pos[1]--
        break
      }
      case 'right': {
        pos[1]++
        break
      }
      }
      this.bullet = { ...this.bullet, pos }
    }
  }

  stopFire() {
    if (this.bullet) {
      if(this.bullet.pos[0]<0 || this.bullet.pos[0] >19 ||
            this.bullet.pos[1]<0 || this.bullet.pos[1] > 9) {
        this.bullet = null
      }
    }
  }

  getNextXy(xy, type) {
    let nextXy
    switch(type) {
    case 'up': {
      nextXy = [xy[0]-1, xy[1]]
      break
    }
    case 'down': {
      nextXy = [xy[0]+1, xy[1]]
      break
    }
    case 'left': {
      nextXy = [xy[0], xy[1]-1]
      break
    }
    case 'right': {
      nextXy = [xy[0], xy[1]+1]
      break
    }
    }
    return nextXy
  }

  checkMove(nextXy, type) {
    switch(type) {
    case 'up': {
      if(nextXy[0] < 0) {return false}
      if (this.matrix[nextXy[0]+1][nextXy[1]] || this.matrix[nextXy[0]+1][nextXy[1]+2] || this.matrix[nextXy[0]][nextXy[1]+1]) {
        return false
      }
      break
    }
    case 'down': {
      if(nextXy[0] > 17) {return false}
      if (this.matrix[nextXy[0]+1][nextXy[1]] || this.matrix[nextXy[0]+1][nextXy[1]+2] || this.matrix[nextXy[0]+2][nextXy[1]+1]) {
        return false
      }
      break
    }
    case 'left': {
      if(nextXy[1] < 0) {return false}
      if (this.matrix[nextXy[0]][nextXy[1]+1] || this.matrix[nextXy[0]+1][nextXy[1]] || this.matrix[nextXy[0]+2][nextXy[1]+1]) {
        return false
      }
      break
    }
    case 'right': {
      if(nextXy[1] > 7) {return false}
      if (this.matrix[nextXy[0]][nextXy[1]+1] || this.matrix[nextXy[0]+1][nextXy[1]+2] || this.matrix[nextXy[0]+2][nextXy[1]+1]) {
        return false
      }
      break
    }
    }
    return true
  }

  move(type) {
    if (this.direction !== type) {
      const occupied = initPos(playerShape[type], this.player)
      const blocked = occupied.some(([x, y]) => this.stones.some(stone => stone[0] === x && stone[1] === y) ||
        this.enemies.some(enemy => enemy.position.some(pos => pos[0] === x && pos[1] === y)))
      if (!blocked) this.direction = type
    } else {
      let nextXy = this.getNextXy(this.player, type)
      if (this.checkMove(nextXy, type)) {
        this.player = nextXy
      }
    }
  }

  drawPlayer() {
    let matrix = copyData(blankMatrix)
    playerShape[this.direction].forEach((m, k1) => {
      m.forEach((n, k2) => {
        if (n) {
          matrix[k1+this.player[0]][k2+this.player[1]] = n
        }
      })
    })
    this.matrix = matrix
  }

  toJsObj() {
    const { ...object } = this
    return object
  }
}

export const createNewTank = (rng = Math.random) => {
  return new Tank({ rng })
}

export default Tank
