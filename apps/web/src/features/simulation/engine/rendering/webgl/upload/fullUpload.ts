export function uploadFullTexture(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  colorsPtr: number
  worldWidth: number
  worldHeight: number
  pboSize: number
  usePBO: boolean
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number
  immediate: boolean
}): { pboIndex: number } {
  const {
    gl,
    memoryView,
    colorsPtr,
    worldWidth,
    worldHeight,
    pboSize,
    usePBO,
    pbo,
    pboIndex,
    immediate,
  } = args

  // Full upload assumes tightly-packed rows.
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)

  // When immediate=true, skip PBO to avoid 1-frame latency (critical for paused input)
  if (!immediate && usePBO && pbo[pboIndex]) {
    // PBO path: async upload (1-frame latency but better throughput)
    // 1. Bind next PBO for upload
    const uploadPBO = pbo[pboIndex]
    const texturePBO = pbo[1 - pboIndex]

    try {
      // 2. Upload data to PBO (CPU → PBO, async DMA)
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, uploadPBO)
      gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, memoryView.subarray(colorsPtr, colorsPtr + pboSize))

      // 3. Upload from other PBO to texture (PBO → GPU, async)
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, texturePBO)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, worldWidth, worldHeight, gl.RGBA, gl.UNSIGNED_BYTE, 0)

      return { pboIndex: 1 - pboIndex }
    } finally {
      // Always unbind: if an exception occurs, leaving a PBO bound breaks CPU-backed texSubImage2D calls.
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
    }
  }

  // Direct upload (no PBO) - immediate display, slightly slower but no latency
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)

  // Avoid using the WebGL2 `srcOffset` overload here: some drivers are picky and can report
  // "ArrayBufferView not big enough" even when the underlying WASM memory is large enough.
  // A subarray view is still zero-copy and keeps bounds explicit.
  const pixels = memoryView.subarray(colorsPtr, colorsPtr + pboSize)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, worldWidth, worldHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  return { pboIndex }
}
