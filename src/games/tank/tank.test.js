import Tank, { createNewTank } from './tank'
import { generateEnemy } from './enemy'

describe('Tank collision and spawning', () => {
  test('starting stones are unique and never overlap the player or a corner', () => {
    const game = createNewTank(() => 0.75)
    const keys = game.stones.map(([x, y]) => `${x},${y}`)
    expect(new Set(keys).size).toBe(3)
    expect(game.stones).toHaveLength(3)
    expect(game.stones.every(([x, y]) => !(x >= 15 && x <= 17 && y >= 4 && y <= 6))).toBe(true)
    expect(keys.every(key => !['0,0', '0,9', '19,0', '19,9'].includes(key))).toBe(true)
  })

  test('enemy spawning skips a completely occupied board instead of forcing the corner', () => {
    const game = new Tank({ stones: [], rng: () => 0 })
    game.matrix = Array.from({ length: 20 }, () => Array(10).fill(1))
    expect(game.randomEnemyPos()).toBeNull()
    game.addEnemy()
    expect(game.enemies).toHaveLength(0)
  })

  test('two enemies cannot move into the same gap at once', () => {
    const enemies = [
      generateEnemy({ direction: 'right', xy: [3, 0] }),
      generateEnemy({ direction: 'left', xy: [3, 4] })
    ]
    const game = new Tank({ enemies, stones: [], rng: () => 0.25 })
    game.enemiesMove()
    const first = new Set(game.enemies[0].position.map(([x, y]) => `${x},${y}`))
    expect(game.enemies[1].position.every(([x, y]) => !first.has(`${x},${y}`))).toBe(true)
  })

  test('turning cannot rotate the player body through a stone', () => {
    const game = new Tank({ player: [10, 4], direction: 'up', stones: [[10, 4]], rng: () => 0 })
    game.move('down')
    expect(game.direction).toBe('up')
  })

  test('a blocked enemy cannot rotate through a stone', () => {
    const enemy = generateEnemy({ direction: 'up', xy: [3, 3] })
    const game = new Tank({ enemies: [enemy], stones: [[2, 4], [3, 3]], rng: () => 0.25 })
    game.enemiesMove()
    expect(game.enemies[0].direction).toBe('up')
    expect(game.enemies[0].xy).toEqual([3, 3])
  })

  test('the only enemy can fire at any random draw', () => {
    const enemies = [generateEnemy({ direction: 'up', xy: [3, 3] })]
    const game = new Tank({ enemies, stones: [], rng: () => 0.99 })
    game.enemiesFire()
    expect(game.enemiesBullets).toEqual([{ direction: 'up', pos: [2, 4] }])
  })

  test('an enemy bullet stops at a stone instead of passing through it', () => {
    const enemies = [generateEnemy({ direction: 'up', xy: [3, 3] })]
    const game = new Tank({ enemies, stones: [[2, 4]], rng: () => 0 })
    game.enemiesFire()
    game.draw()
    expect(game.enemiesBullets).toHaveLength(0)
    expect(game.stones).toEqual([[2, 4]])
  })


})
