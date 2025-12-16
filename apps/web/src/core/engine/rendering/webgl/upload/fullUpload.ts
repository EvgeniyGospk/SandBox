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

  // When immediate=true, skip PBO to avoid 1-frame latency (critical for paused input)
  if (!immediate && usePBO && pbo[pboIndex]) {
    // PBO path: async upload (1-frame latency but better throughput)
    // 1. Bind next PBO for upload
    const uploadPBO = pbo[pboIndex]
    const texturePBO = pbo[1 - pboIndex]

    // 2. Upload data to PBO (CPU → PBO, async DMA)
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, uploadPBO)
    gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, memoryView.subarray(colorsPtr, colorsPtr + pboSize))

    // 3. Upload from other PBO to texture (PBO → GPU, async)
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, texturePBO)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, worldWidth, worldHeight, gl.RGBA, gl.UNSIGNED_BYTE, 0)

    // 4. Unbind and swap
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
    return { pboIndex: 1 - pboIndex }
  }

  // Direct upload (no PBO) - immediate display, slightly slower but no latency
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, worldWidth, worldHeight, gl.RGBA, gl.UNSIGNED_BYTE, memoryView, colorsPtr)
  return { pboIndex }
}
