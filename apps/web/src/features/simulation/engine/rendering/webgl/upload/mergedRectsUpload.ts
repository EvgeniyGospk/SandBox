export function uploadMergedRect(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  colorsPtr: number
  worldWidth: number
  worldHeight: number
  x: number
  y: number
  w: number
  h: number
}): void {
  // Upload directly from the full world color buffer using WebGL2's UNPACK_ROW_LENGTH.
  // This avoids calling into WASM to build per-rect scratch buffers (which can grow WASM
  // memory and detach `memory.buffer` mid-frame).
  const bytesPerPixel = 4
  const colorsEnd = args.colorsPtr + args.worldWidth * args.worldHeight * bytesPerPixel
  const base = args.colorsPtr + (args.y * args.worldWidth + args.x) * bytesPerPixel
  const pixels = args.memoryView.subarray(base, colorsEnd)

  args.gl.texSubImage2D(
    args.gl.TEXTURE_2D,
    0,
    args.x,
    args.y,
    args.w,
    args.h,
    args.gl.RGBA,
    args.gl.UNSIGNED_BYTE,
    pixels
  )
}

export type UploadRect = {
  x: number
  y: number
  w: number
  h: number
}

export function uploadMergedRectsBatch(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  colorsPtr: number
  worldWidth: number
  worldHeight: number
  rects: ReadonlyArray<UploadRect>
}): { ok: true } | { ok: false; error: unknown } {
  try {
    // Ensure we're not accidentally still in PBO upload mode when doing CPU-backed uploads.
    args.gl.bindBuffer(args.gl.PIXEL_UNPACK_BUFFER, null)

    // Use full-world stride when uploading sub-rectangles from the big color buffer.
    args.gl.pixelStorei(args.gl.UNPACK_ROW_LENGTH, args.worldWidth)
    args.gl.pixelStorei(args.gl.UNPACK_SKIP_PIXELS, 0)
    args.gl.pixelStorei(args.gl.UNPACK_SKIP_ROWS, 0)

    for (const rect of args.rects) {
      if (rect.w <= 0 || rect.h <= 0) continue

      uploadMergedRect({
        gl: args.gl,
        memoryView: args.memoryView,
        colorsPtr: args.colorsPtr,
        worldWidth: args.worldWidth,
        worldHeight: args.worldHeight,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      })
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  } finally {
    // Reset WebGL pixel store state for any later full uploads (which assume tight packing).
    args.gl.pixelStorei(args.gl.UNPACK_ROW_LENGTH, 0)
    args.gl.pixelStorei(args.gl.UNPACK_SKIP_PIXELS, 0)
    args.gl.pixelStorei(args.gl.UNPACK_SKIP_ROWS, 0)
  }
}
