export function drawBufferToScreen(args: {
  ctx: CanvasRenderingContext2D
  bufferCanvas: HTMLCanvasElement | OffscreenCanvas

  viewportW: number
  viewportH: number

  worldW: number
  worldH: number

  zoom: number
  panX: number
  panY: number

  backgroundRgb: { r: number; g: number; b: number }

  drawWorldBorder: (x: number, y: number, width: number, height: number) => void
}): void {
  const {
    ctx,
    bufferCanvas,
    viewportW,
    viewportH,
    worldW,
    worldH,
    zoom,
    panX,
    panY,
    backgroundRgb,
    drawWorldBorder,
  } = args

  ctx.fillStyle = `rgb(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b})`
  ctx.fillRect(0, 0, viewportW, viewportH)

  const worldAspect = worldW / worldH
  const viewportAspect = viewportW / viewportH
  const scaleToFit = worldAspect > viewportAspect ? viewportW / worldW : viewportH / worldH
  const drawW = worldW * scaleToFit
  const drawH = worldH * scaleToFit
  const offsetX = (viewportW - drawW) / 2
  const offsetY = (viewportH - drawH) / 2

  ctx.save()

  const centerX = viewportW / 2
  const centerY = viewportH / 2
  ctx.translate(centerX + panX, centerY + panY)
  ctx.scale(zoom, zoom)
  ctx.translate(-centerX, -centerY)

  ctx.drawImage(bufferCanvas, 0, 0, worldW, worldH, offsetX, offsetY, drawW, drawH)

  drawWorldBorder(offsetX, offsetY, drawW, drawH)

  ctx.restore()
}
