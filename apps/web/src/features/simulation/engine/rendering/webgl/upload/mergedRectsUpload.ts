export function uploadMergedRect(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  engine: { extract_rect_pixels: (rectIndex: number) => number }
  rectIndex: number
  x: number
  y: number
  w: number
  h: number
}): void {
  const pixelsPtr = args.engine.extract_rect_pixels(args.rectIndex)

  args.gl.texSubImage2D(
    args.gl.TEXTURE_2D,
    0,
    args.x,
    args.y,
    args.w,
    args.h,
    args.gl.RGBA,
    args.gl.UNSIGNED_BYTE,
    args.memoryView,
    pixelsPtr
  )
}

export function uploadMergedRectsBatch(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  engine: {
    get_merged_rect_x: (i: number) => number
    get_merged_rect_y: (i: number) => number
    get_merged_rect_w: (i: number) => number
    get_merged_rect_h: (i: number) => number
    extract_rect_pixels: (rectIndex: number) => number
  }
  rectCount: number
  worldWidth: number
  worldHeight: number
}): { ok: true } | { ok: false; error: unknown } {
  try {
    for (let i = 0; i < args.rectCount; i++) {
      const x = args.engine.get_merged_rect_x(i)
      const y = args.engine.get_merged_rect_y(i)
      const w = args.engine.get_merged_rect_w(i)
      const h = args.engine.get_merged_rect_h(i)

      // Skip invalid rects
      if (w === 0 || h === 0) continue

      // Clamp to world bounds
      const actualW = Math.min(w, args.worldWidth - x)
      const actualH = Math.min(h, args.worldHeight - y)

      if (actualW <= 0 || actualH <= 0) continue

      // Upload to texture
      // Note: texSubImage2D expects row-major data with stride = width
      uploadMergedRect({
        gl: args.gl,
        memoryView: args.memoryView,
        engine: args.engine,
        rectIndex: i,
        x,
        y,
        w: actualW,
        h: actualH,
      })
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
