export const speeds = [1000, 800, 650, 500, 370, 200]

export default class Snake {

  constructor({ head, bodies, food, deadth, death, levels, direction, rng = Math.random }) {
    Object.defineProperty(this, 'rng', { value: rng })
    this.head = head || this.initHead()
    this.bodies = bodies || this.initBodies(levels)
    this.food = food || this.changeFood()
    this.deadth = death || deadth || false
    this.direction = direction || ''
  }

  initHead() {
    return [
      Math.floor(this.rng()*19),
      Math.floor(this.rng()*4)
    ]
  }

  initBodies({ levels }) {
    let bodies = [this.head]
    let l = levels + 1
    if(l > 5) l = 5
    while(bodies.length < 6 && l > 0) {
      bodies.push([
        this.head[0],
        bodies[bodies.length-1][1]+1,
      ])
      l--
    }
    return bodies
  }

  changeFood() {
    let food = randomXY(this.rng)
    // while(this.bodies.contains(food)) {
    //   food = List(randomXY())
    // }
    let attempts = 0
    while(this.bodies.some(point => {
      return point[0] === food[0] && point[1] === food[1]
    }) && attempts++ < 200) {
      food = randomXY(this.rng)
    }
    if (this.bodies.some(point => point[0] === food[0] && point[1] === food[1])) {
      for (let x = 0; x < 20; x++) {
        for (let y = 0; y < 10; y++) {
          if (!this.bodies.some(point => point[0] === x && point[1] === y)) return [x, y]
        }
      }
      this.deadth = true
    }
    return food
  }

  setDeath(death) {
    this.deadth = death
  }

  getDeath() {
    return this.deadth
  }

  getHead() {
    return this.head
  }

  addBody() {
    this.bodies = [[...this.head], ...this.bodies.concat()]
  }

  moveBody(x, y) {
    const newBodies = this.bodies.slice(0, -1)
    newBodies.unshift([x, y])
    this.bodies = newBodies
  }

  //检测头是否撞到身体
  checkHeadBody(x, y) {
    return this.bodies.slice(1).some(point => {
      return point[0] === x && point[1] === y
    })
  }

  checkBorder(x, y) {
    return x >= 0 && x <20 &&
           y >= 0 && y <10
  }

  getNextXY() {
    let [x, y] = this.head
    switch(this.direction) {
    case 'down': x+=1; break
    case 'up': x-=1; break
    case 'left': y-=1; break
    case 'right': y+=1; break
    }
    return [x, y]
  }

  move() {
    let [x, y] = this.getNextXY()
    //反向
    if (x===this.bodies[1][0] && y===this.bodies[1][1]) {
      return false
    }

    if (!this.checkBorder(x, y) || this.checkHeadBody(x, y)) {
      this.setDeath(true)
      return false
    }

    this.head = [x, y]

    if (x === this.food[0] && y === this.food[1]) {
      this.addBody()
      this.food = this.changeFood()
      return true
    }
    this.moveBody(x, y)

    return false
  }

  toJsObj() {
    return {
      head: this.head,
      bodies: this.bodies,
      food: this.food,
      death: this.deadth,
      direction: this.direction
    }
  }
}

export const randomXY = (rng = Math.random) => {
  return [
    Math.floor(rng()*19),
    Math.floor(rng()*9),
  ]
}

export const createNewSnake = (levels, rng = Math.random) => {
  return new Snake({ levels, rng })
}
