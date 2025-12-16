export function startMenuBackgroundLoop(args: {
  gl: WebGL2RenderingContext
  canvas: HTMLCanvasElement
  program: WebGLProgram
  timeLoc: WebGLUniformLocation | null
  resLoc: WebGLUniformLocation | null
}): () => void {
  const { gl, canvas, program, timeLoc, resLoc } = args

  let animId: number
  const startTime = performance.now()

  const render = () => {
    const time = (performance.now() - startTime) / 1000

    gl.useProgram(program)
    gl.uniform1f(timeLoc, time)
    gl.uniform2f(resLoc, canvas.width, canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    animId = requestAnimationFrame(render)
  }

  render()

  return () => {
    cancelAnimationFrame(animId)
  }
}
