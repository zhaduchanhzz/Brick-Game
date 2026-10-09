import Breakout from './breakout'

const ball = (y, dy = 1) => new Breakout({ x: 18, y, dx: 1, dy, bricks: [[0, 9]], paddleY: 3 })

test('paddle collision uses the arriving column and exactly three paddle cells', () => {
  const arrivingAtPaddle = ball(2)
  arrivingAtPaddle.run()
  expect(arrivingAtPaddle.death).toBe(false)
  expect([arrivingAtPaddle.x, arrivingAtPaddle.y]).toEqual([17, 3])

  const pastPaddle = ball(6)
  pastPaddle.run()
  expect(pastPaddle.death).toBe(true)
  expect([pastPaddle.x, pastPaddle.y]).toEqual([19, 7])
})

test('paddle position changes the outgoing angle without dragging the ball', () => {
  const center = ball(3)
  center.run()
  expect(center.lateralPeriod).toBe(2)
  center.run()
  center.run()
  expect([center.x, center.y]).toEqual([15, 5])

  const edge = ball(4)
  edge.run()
  expect(edge.lateralPeriod).toBe(1)
  edge.run()
  edge.run()
  expect([edge.x, edge.y]).toEqual([15, 7])

  const movingPaddle = ball(4)
  movingPaddle.move('left')
  expect([movingPaddle.x, movingPaddle.y, movingPaddle.paddleY]).toEqual([18, 4, 2])
})

test('a dry second paddle return can aim at an isolated remaining brick', () => {
  const game = new Breakout({ x: 18, y: 3, dx: 1, dy: 1, bricks: [[0, 9]], paddleY: 3, dryPaddleHits: 1 })
  game.run()
  expect(game.dryPaddleHits).toBe(2)
  for (let i = 0; i < 17 && !game.death; i++) {
    game.run()
    game.collisionDetection()
  }
  expect(game.bricks).toEqual([])
  expect(game.death).toBe(true)
})
