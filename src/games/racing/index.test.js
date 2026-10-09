import Racing from './index'

describe('Racing lane changes', () => {
  test('can escape a car in the current lane when the destination lane is open', () => {
    const game = new Racing({ y: 2, cars: [[13, 2]] })

    expect(game.move('right')).toBe(true)
    expect(game.y).toBe(5)
    expect(game.collisionDetection()).toBe(false)
  })

  test.each([13, 14, 15, 16, 17])('cannot switch into a car at row %i', row => {
    const game = new Racing({ y: 2, cars: [[row, 5]] })

    expect(game.move('right')).toBe(false)
    expect(game.y).toBe(2)
  })

  test.each([12, 18])('can switch when a car at row %i does not overlap the player', row => {
    const game = new Racing({ y: 2, cars: [[row, 5]] })

    expect(game.move('right')).toBe(true)
    expect(game.y).toBe(5)
  })

  test('ignores unsupported movement', () => {
    const game = new Racing({ y: 2, cars: [] })

    expect(game.move('up')).toBe(false)
    expect(game.y).toBe(2)
  })
})
