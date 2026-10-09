// xorshift32. The unsigned 32-bit state is serialized with every game step.
export const nextRandom = (holder) => {
  let value = holder.rngState >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  holder.rngState = value >>> 0
  return holder.rngState / 0x100000000
}
