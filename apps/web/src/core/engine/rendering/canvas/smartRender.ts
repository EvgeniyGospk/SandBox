export function shouldFallbackToFullRender(args: {
  dirtyCount: number
  worldWidth: number
  worldHeight: number
  chunkSize: number
  thresholdRatio: number
}): boolean {
  const { dirtyCount, worldWidth, worldHeight, chunkSize, thresholdRatio } = args

  const totalChunks = Math.ceil(worldWidth / chunkSize) * Math.ceil(worldHeight / chunkSize)
  return dirtyCount > totalChunks * thresholdRatio
}

export function getDirtyChunkIdsView(args: {
  memory: WebAssembly.Memory
  listPtr: number
  count: number
}): Uint32Array {
  const { memory, listPtr, count } = args
  return new Uint32Array(memory.buffer, listPtr, count)
}
