import { debugWarn } from '../../../../logging/log'

type Transform = { zoom: number; panX: number; panY: number }

export function renderThermal(args: {
  isContextLost: boolean
  needsReinit: boolean
  reinitializeResources: () => void
  onReinitError: (err: unknown) => void

  gl: WebGL2RenderingContext
  texture: WebGLTexture
  viewportWidth: number
  viewportHeight: number

  imageData: ImageData
  transform: Transform

  drawTexturePass: (transform: Transform) => void
  drawBorderPass: (transform: Transform) => void
}): void {
  const {
    isContextLost,
    needsReinit,
    reinitializeResources,
    onReinitError,
    gl,
    texture,
    viewportWidth,
    viewportHeight,
    imageData,
    transform,
    drawTexturePass,
    drawBorderPass,
  } = args

  if (isContextLost) return

  if (needsReinit) {
    try {
      reinitializeResources()
    } catch (e) {
      debugWarn('WebGL reinit failed:', e)
      onReinitError(e)
      return
    }
  }

  gl.viewport(0, 0, viewportWidth, viewportHeight)

  // Clear with dark background
  gl.clearColor(0.04, 0.04, 0.04, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  // Upload thermal image data to texture
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData)

  // Draw texture with transform
  drawTexturePass(transform)

  // Draw border
  drawBorderPass(transform)
}
