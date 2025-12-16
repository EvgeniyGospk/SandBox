export function uploadDirtyChunk(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  engine: { extract_chunk_pixels: (chunkIdx: number) => number }
  chunkIdx: number
  xOffset: number
  yOffset: number
  uploadW: number
  uploadH: number
}): void {
  const pixelsPtr = args.engine.extract_chunk_pixels(args.chunkIdx)

  args.gl.texSubImage2D(
    args.gl.TEXTURE_2D,
    0,
    args.xOffset,
    args.yOffset,
    args.uploadW,
    args.uploadH,
    args.gl.RGBA,
    args.gl.UNSIGNED_BYTE,
    args.memoryView,
    pixelsPtr
  )
}
