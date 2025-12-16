export function applyDirtyChunksToBuffer(args: {
  engine: { extractChunkPixels: (idx: number) => number }
  memory: WebAssembly.Memory

  dirtyIds: Uint32Array
  chunksX: number
  chunkSize: number

  chunkImageData: ImageData
  bufferCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}): void {
  const { engine, memory, dirtyIds, chunksX, chunkSize, chunkImageData, bufferCtx } = args

  const bytesPerChunk = chunkSize * chunkSize * 4

  for (let i = 0; i < dirtyIds.length; i++) {
    const chunkIdx = dirtyIds[i]

    const pixelsPtr = engine.extractChunkPixels(chunkIdx)

    const chunkPixels = new Uint8ClampedArray(memory.buffer, pixelsPtr, bytesPerChunk)

    chunkImageData.data.set(chunkPixels)

    const cx = chunkIdx % chunksX
    const cy = Math.floor(chunkIdx / chunksX)
    const x = cx * chunkSize
    const y = cy * chunkSize

    bufferCtx.putImageData(chunkImageData, x, y)
  }
}
