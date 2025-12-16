export function prepareBorderPass(args: {
  gl: WebGL2RenderingContext
  lineProgram: WebGLProgram
  lineBuffer: WebGLBuffer
  uLineTransform: WebGLUniformLocation | null
  uLineWorldSize: WebGLUniformLocation | null
  uLineViewportSize: WebGLUniformLocation | null
  transform: { zoom: number; panX: number; panY: number }
  worldWidth: number
  worldHeight: number
  viewportWidth: number
  viewportHeight: number
}): void {
  args.gl.useProgram(args.lineProgram)

  args.gl.uniform4f(args.uLineTransform, args.transform.zoom, args.transform.panX, args.transform.panY, 0)
  args.gl.uniform2f(args.uLineWorldSize, args.worldWidth, args.worldHeight)
  args.gl.uniform2f(args.uLineViewportSize, args.viewportWidth, args.viewportHeight)

  args.gl.bindBuffer(args.gl.ARRAY_BUFFER, args.lineBuffer)
  const posLoc = args.gl.getAttribLocation(args.lineProgram, 'a_position')
  args.gl.enableVertexAttribArray(posLoc)
  args.gl.vertexAttribPointer(posLoc, 2, args.gl.FLOAT, false, 0, 0)
}

export function drawOuterGlow(args: { gl: WebGL2RenderingContext; uLineColor: WebGLUniformLocation | null }): void {
  args.gl.lineWidth(3.0)
  args.gl.uniform4f(args.uLineColor, 0.2, 0.5, 1.0, 0.4)
  args.gl.drawArrays(args.gl.LINE_LOOP, 0, 4)
}

export function drawInnerSharpLine(args: { gl: WebGL2RenderingContext; uLineColor: WebGLUniformLocation | null }): void {
  args.gl.lineWidth(1.0)
  args.gl.uniform4f(args.uLineColor, 0.4, 0.7, 1.0, 0.9)
  args.gl.drawArrays(args.gl.LINE_LOOP, 0, 4)
}
