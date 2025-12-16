export function drawTexturePass(args: {
  gl: WebGL2RenderingContext
  texProgram: WebGLProgram
  quadBuffer: WebGLBuffer
  uTexTransform: WebGLUniformLocation | null
  uTexWorldSize: WebGLUniformLocation | null
  uTexViewportSize: WebGLUniformLocation | null
  transform: { zoom: number; panX: number; panY: number }
  worldWidth: number
  worldHeight: number
  viewportWidth: number
  viewportHeight: number
}): void {
  args.gl.useProgram(args.texProgram)

  args.gl.uniform4f(args.uTexTransform, args.transform.zoom, args.transform.panX, args.transform.panY, 0)
  args.gl.uniform2f(args.uTexWorldSize, args.worldWidth, args.worldHeight)
  args.gl.uniform2f(args.uTexViewportSize, args.viewportWidth, args.viewportHeight)

  args.gl.bindBuffer(args.gl.ARRAY_BUFFER, args.quadBuffer)
  const posLoc = args.gl.getAttribLocation(args.texProgram, 'a_position')
  args.gl.enableVertexAttribArray(posLoc)
  args.gl.vertexAttribPointer(posLoc, 2, args.gl.FLOAT, false, 0, 0)

  args.gl.drawArrays(args.gl.TRIANGLE_STRIP, 0, 4)
}
