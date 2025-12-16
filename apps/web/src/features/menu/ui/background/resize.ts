export function installFullscreenResize(args: {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
}): () => void {
  const { canvas, gl } = args

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  resize()
  window.addEventListener('resize', resize)

  return () => {
    window.removeEventListener('resize', resize)
  }
}
