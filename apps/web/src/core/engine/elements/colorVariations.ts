export function computeColorVariations(base: number): Uint32Array {
  const variations = new Uint32Array(32)

  for (let i = 0; i < 32; i++) {
    const variation = (i - 16) * 2
    const a = (base >> 24) & 0xff
    const r = Math.max(0, Math.min(255, ((base >> 16) & 0xff) + variation))
    const g = Math.max(0, Math.min(255, ((base >> 8) & 0xff) + variation))
    const b = Math.max(0, Math.min(255, (base & 0xff) + variation))
    variations[i] = (a << 24) | (r << 16) | (g << 8) | b
  }

  return variations
}

export function precomputeColorVariationsById(args: {
  elementCount: number
  getBaseColorById: (id: number) => number
}): Uint32Array[] {
  const { elementCount, getBaseColorById } = args

  const result: Uint32Array[] = new Array(elementCount)

  for (let elId = 0; elId < elementCount; elId++) {
    const base = getBaseColorById(elId)
    result[elId] = computeColorVariations(base)
  }

  return result
}
