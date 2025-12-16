export function createQuadBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer()
  if (!buffer) throw new Error('Failed to create WebGL buffer')
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  const positions = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ])
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
  return buffer
}

export function createBorderBuffer(
  gl: WebGL2RenderingContext,
  worldWidth: number,
  worldHeight: number
): WebGLBuffer {
  const buffer = gl.createBuffer()
  if (!buffer) throw new Error('Failed to create WebGL buffer')
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // Border coordinates in world pixels (0,0) -> (W,0) -> (W,H) -> (0,H)
  const vertices = new Float32Array([0, 0, worldWidth, 0, worldWidth, worldHeight, 0, worldHeight])
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW)
  return buffer
}

export function updateBorderBuffer(
  gl: WebGL2RenderingContext,
  lineBuffer: WebGLBuffer,
  worldWidth: number,
  worldHeight: number
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)
  const vertices = new Float32Array([0, 0, worldWidth, 0, worldWidth, worldHeight, 0, worldHeight])
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices)
}
