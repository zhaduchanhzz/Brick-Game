import Tetris, { originXY } from './tetris'
import { blockShape } from './block'

const emptyMatrix = () => Array.from({ length: 20 }, () => Array(10).fill(0))
const gameWith = (matrix, xy = originXY) => new Tetris({
  levels: 1, matrix, xy, shape: blockShape.O, next: 'I', score: 0
})

describe('Tetris top-out', () => {
  test('sparse blocks in every row do not end a playable run', () => {
    const matrix = emptyMatrix()
    matrix.forEach(row => { row[0] = 1 })
    const game = gameWith(matrix)

    expect(game.checkMove('down')).toBe(true)
    expect(game.isDead()).toBe(false)
  })

  test('a blocked spawn lane ends the run before another lock', () => {
    const matrix = emptyMatrix()
    matrix[0][4] = 1
    const game = gameWith(matrix)

    expect(game.checkMove('down')).toBe(false)
    expect(game.isDead()).toBe(true)
  })

  test('a piece locked above the board remains terminal after serialization', () => {
    const matrix = emptyMatrix()
    matrix[1][4] = 1
    const game = gameWith(matrix, [-1, 4])

    expect(game.checkMove('down')).toBe(false)
    game.draw()
    expect(game.toppedOut).toBe(true)
    const restored = new Tetris({ ...game.toJsObj(), xy: [5, 4] })
    expect(restored.isDead()).toBe(true)
  })
})
