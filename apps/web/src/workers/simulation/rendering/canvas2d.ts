import type { SimulationWorkerState } from '../state'

export function renderCanvas2DToScreen(
  state: SimulationWorkerState,
  transform: { zoom: number; panX: number; panY: number }
): void {
  if (!state.canvas || !state.thermalCanvas || !state.screenCtx) return

  const viewportW = state.canvas.width
  const viewportH = state.canvas.height
  const worldW = state.thermalCanvas.width
  const worldH = state.thermalCanvas.height

  if (viewportW <= 0 || viewportH <= 0 || worldW <= 0 || worldH <= 0) return

  const worldAspect = worldW / worldH
  const viewportAspect = viewportW / viewportH
  const scaleToFit = worldAspect > viewportAspect ? viewportW / worldW : viewportH / worldH
  const drawW = worldW * scaleToFit
  const drawH = worldH * scaleToFit
  const offsetX = (viewportW - drawW) / 2
  const offsetY = (viewportH - drawH) / 2

  state.screenCtx.setTransform(1, 0, 0, 1, 0, 0)
  state.screenCtx.fillStyle = '#0a0a0a'
  state.screenCtx.fillRect(0, 0, viewportW, viewportH)

  state.screenCtx.save()

  const centerX = viewportW / 2
  const centerY = viewportH / 2
  state.screenCtx.translate(centerX + transform.panX, centerY + transform.panY)
  state.screenCtx.scale(transform.zoom, transform.zoom)
  state.screenCtx.translate(-centerX, -centerY)

  state.screenCtx.drawImage(state.thermalCanvas, 0, 0, worldW, worldH, offsetX, offsetY, drawW, drawH)

  drawWorldBorder2D(state.screenCtx, offsetX, offsetY, drawW, drawH, transform.zoom)
  state.screenCtx.restore()
}

function drawWorldBorder2D(
  target: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number
): void {
  const z = zoom || 1

  target.strokeStyle = 'rgba(59, 130, 246, 0.3)'
  target.lineWidth = 6 / z
  target.strokeRect(x - 3 / z, y - 3 / z, width + 6 / z, height + 6 / z)

  target.strokeStyle = 'rgba(59, 130, 246, 0.5)'
  target.lineWidth = 3 / z
  target.strokeRect(x - 1.5 / z, y - 1.5 / z, width + 3 / z, height + 3 / z)

  target.strokeStyle = 'rgba(59, 130, 246, 0.8)'
  target.lineWidth = 1 / z
  target.strokeRect(x, y, width, height)

  const cornerSize = 8 / z
  target.fillStyle = '#3B82F6'

  target.fillRect(x - cornerSize / 2, y - cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x - cornerSize / 2, y - cornerSize / 2, 2 / z, cornerSize)

  target.fillRect(x + width - cornerSize / 2, y - cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x + width - 2 / z + cornerSize / 2, y - cornerSize / 2, 2 / z, cornerSize)

  target.fillRect(x - cornerSize / 2, y + height - 2 / z + cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x - cornerSize / 2, y + height - cornerSize / 2, 2 / z, cornerSize)

  target.fillRect(x + width - cornerSize / 2, y + height - 2 / z + cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x + width - 2 / z + cornerSize / 2, y + height - cornerSize / 2, 2 / z, cornerSize)
}
