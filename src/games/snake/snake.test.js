import Snake, { createNewSnake, randomXY } from './snake'

describe('Snake movement and food', () => {
  test('moving into the cell vacated by the tail is legal', () => {
    const game = new Snake({
      head: [1, 1], bodies: [[1, 1], [1, 2], [2, 2], [2, 1]],
      food: [0, 0], direction: 'down'
    })

    expect(game.move()).toBe(false)
    expect(game.getDeath()).toBe(false)
    expect(game.head).toEqual([2, 1])
    expect(game.bodies).toEqual([[2, 1], [1, 1], [1, 2], [2, 2]])
  })

  test('a collision with the body still ends the run', () => {
    const game = new Snake({
      head: [1, 1], bodies: [[1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1]],
      food: [0, 0], direction: 'right'
    })

    expect(game.move()).toBe(false)
    expect(game.getDeath()).toBe(true)
  })

  test('food can appear in the last row and last column', () => {
    expect(randomXY(() => 0.999999)).toEqual([19, 9])
  })

  test('numeric and object level inputs both create the intended starting length', () => {
    expect(createNewSnake(3, () => 0.9).bodies).toHaveLength(5)
    expect(createNewSnake({ levels: 3 }, () => 0.9).bodies).toHaveLength(5)
  })
})
