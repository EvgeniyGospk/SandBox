type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export function floodFillInPlace(args: {
  world: WasmWorld
  typesView: Uint8Array
  width: number
  height: number
  startX: number
  startY: number
  targetId: number
  limit: number
}): void {
  const { world, typesView, width, height, startX, startY, targetId, limit } = args

  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return

  const startIdx = startY * width + startX
  const sourceId = typesView[startIdx] ?? 0
  if (sourceId === targetId) return

  const visited = new Uint8Array(width * height)
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
  let processed = 0

  while (stack.length > 0) {
    const { x, y } = stack.pop() as { x: number; y: number }
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const i = y * width + x
    if (visited[i]) continue
    if (typesView[i] !== sourceId) continue

    visited[i] = 1
    processed++
    if (processed > limit) break

    if (targetId === 0) {
      world.remove_particle(x, y)
    } else {
      world.remove_particle(x, y)
      world.add_particle(x, y, targetId)
    }

    stack.push({ x: x + 1, y })
    stack.push({ x: x - 1, y })
    stack.push({ x, y: y + 1 })
    stack.push({ x, y: y - 1 })
  }
}
