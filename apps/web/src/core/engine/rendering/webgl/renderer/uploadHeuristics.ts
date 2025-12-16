export function hasEdgeChunks(args: { worldWidth: number; worldHeight: number; chunkSize: number }): boolean {
  const { worldWidth, worldHeight, chunkSize } = args
  return (worldWidth % chunkSize) !== 0 || (worldHeight % chunkSize) !== 0
}

export function shouldFullUploadForDirtyChunks(args: {
  dirtyCount: number
  totalChunks: number
  hasEdgeChunks: boolean
}): boolean {
  const { dirtyCount, totalChunks, hasEdgeChunks } = args
  return dirtyCount > totalChunks * 0.4 || (hasEdgeChunks && dirtyCount > 0)
}

export function getChunkUploadRect(args: {
  chunkIdx: number
  chunksX: number
  chunkSize: number
  worldWidth: number
  worldHeight: number
}): { cx: number; cy: number; xOffset: number; yOffset: number; uploadW: number; uploadH: number } | null {
  const { chunkIdx, chunksX, chunkSize, worldWidth, worldHeight } = args

  const cx = chunkIdx % chunksX
  const cy = (chunkIdx / chunksX) | 0

  const xOffset = cx * chunkSize
  const yOffset = cy * chunkSize

  const uploadW = Math.min(chunkSize, worldWidth - xOffset)
  const uploadH = Math.min(chunkSize, worldHeight - yOffset)

  if (uploadW <= 0 || uploadH <= 0) return null

  return { cx, cy, xOffset, yOffset, uploadW, uploadH }
}

export function shouldFullUploadForMergedRects(args: { rectCount: number; totalChunks: number }): boolean {
  const { rectCount, totalChunks } = args
  return rectCount > totalChunks * 0.3
}

export function computeClampedRectArea(args: {
  x: number
  y: number
  w: number
  h: number
  worldWidth: number
  worldHeight: number
}): { area: number; w: number; h: number } | null {
  const { x, y, w, h, worldWidth, worldHeight } = args
  if (w === 0 || h === 0) return null
  if (x < 0 || y < 0 || x >= worldWidth || y >= worldHeight) return null
  const actualW = Math.min(w, worldWidth - x)
  const actualH = Math.min(h, worldHeight - y)
  if (actualW <= 0 || actualH <= 0) return null
  return { area: actualW * actualH, w: actualW, h: actualH }
}
