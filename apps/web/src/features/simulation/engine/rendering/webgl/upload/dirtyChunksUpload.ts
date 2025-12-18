export function uploadDirtyChunk(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  colorsPtr: number
  worldWidth: number
  worldHeight: number
  xOffset: number
  yOffset: number
  uploadW: number
  uploadH: number
}): void {
  // Upload directly from the full world color buffer using UNPACK_ROW_LENGTH stride.
  const bytesPerPixel = 4
  const colorsEnd = args.colorsPtr + args.worldWidth * args.worldHeight * bytesPerPixel
  const base = args.colorsPtr + (args.yOffset * args.worldWidth + args.xOffset) * bytesPerPixel
  const pixels = args.memoryView.subarray(base, colorsEnd)

  args.gl.texSubImage2D(
    args.gl.TEXTURE_2D,
    0,
    args.xOffset,
    args.yOffset,
    args.uploadW,
    args.uploadH,
    args.gl.RGBA,
    args.gl.UNSIGNED_BYTE,
    pixels
  )
}
