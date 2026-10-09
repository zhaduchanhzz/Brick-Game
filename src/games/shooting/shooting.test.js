import Shooting from './shooting'

describe('Shooting projectile collisions', () => {
  test('a shot removes only the nearest stone in its column', () => {
    const stones = [[3, 5], [12, 5], [12, 6], [10, 5], [16, 5], [7, 4]]
    const game = new Shooting({ x: 5, stones })

    expect(game.shootStone()).toBe(true)
    expect(game.stones).toEqual([[3, 5], [12, 6], [10, 5], [16, 5], [7, 4]])
  })

  test('a missed shot does not remove stones in other columns', () => {
    const stones = [[12, 6], [10, 4]]
    const game = new Shooting({ x: 5, stones })

    expect(game.shootStone()).toBe(false)
    expect(game.stones).toEqual(stones)
  })
})
