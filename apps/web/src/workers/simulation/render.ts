import { debugLog } from '../../core/logging/log'

import { state, BG_COLOR_32, EL_EMPTY } from './state'

export function renderFrame(): void {
  if (state.isCrashed || !state.engine || !state.canvas) return

  const transform = { zoom: state.zoom, panX: state.panX, panY: state.panY }

  if (state.renderMode === 'thermal') {
    if (!state.ctx || !state.pixels || !state.imageData || !state.memoryManager) return

    renderThermal()
    state.ctx.putImageData(state.imageData, 0, 0)

    if (state.useWebGL && state.renderer) {
      state.renderer.renderThermal(state.imageData, transform)
      return
    }

    renderCanvas2DToScreen(transform)
    return
  }

  if (state.useWebGL && state.renderer && state.wasmMemory) {
    if (state.debugDirty) {
      state.debugLogInterval++
      if (state.debugLogInterval >= state.debugLogEvery) {
        state.debugLogInterval = 0

        const dirtyCount = state.engine.count_dirty_chunks ? state.engine.count_dirty_chunks() : 0
        const chunksX = state.engine.chunks_x()
        const chunksY = state.engine.chunks_y()
        const totalChunks = chunksX * chunksY

        let waterCount = 0
        let iceCount = 0
        let sampleTemp = 0
        let sampleCount = 0

        if (state.memoryManager) {
          const types = state.memoryManager.types
          const temps = state.memoryManager.temperature
          const len = types.length
          for (let i = 0; i < len; i++) {
            const type = types[i]
            if (type === 6) {
              waterCount++
              sampleTemp += temps[i]
              sampleCount++
            } else if (type === 5) {
              iceCount++
              sampleTemp += temps[i]
              sampleCount++
            }
          }
        }

        const avgTemp = sampleCount > 0 ? (sampleTemp / sampleCount).toFixed(1) : 'N/A'
        const ambientTemp = state.engine.get_ambient_temperature ? state.engine.get_ambient_temperature() : 'N/A'

        debugLog(`🔍 DEBUG [Frame]: dirty=${dirtyCount}/${totalChunks}, water=${waterCount}, ice=${iceCount}, avgTemp=${avgTemp}°C, ambient=${ambientTemp}°C`)
      }
    }

    state.renderer.renderWithDirtyRects(state.engine, state.wasmMemory, transform)
    return
  }

  if (!state.ctx || !state.pixels32 || !state.imageData || !state.memoryManager) return

  renderNormal()
  state.ctx.putImageData(state.imageData, 0, 0)
  renderCanvas2DToScreen(transform)
}

function renderNormal(): void {
  if (!state.pixels32 || !state.memoryManager) return

  const typesView = state.memoryManager.types
  const colorsView = state.memoryManager.colors
  const len = Math.min(typesView.length, state.pixels32.length)

  state.pixels32.set(colorsView.subarray(0, len))

  for (let i = 0; i < len; i++) {
    if (typesView[i] === EL_EMPTY) {
      state.pixels32[i] = BG_COLOR_32
    }
  }
}

function renderThermal(): void {
  if (!state.pixels || !state.memoryManager) return

  const temperatureView = state.memoryManager.temperature
  const len = Math.min(temperatureView.length, state.pixels.length / 4)

  for (let i = 0; i < len; i++) {
    const temp = temperatureView[i]
    const base = i << 2

    const [r, g, b] = getThermalColor(temp)

    state.pixels[base] = r
    state.pixels[base + 1] = g
    state.pixels[base + 2] = b
    state.pixels[base + 3] = 255
  }
}

function getThermalColor(t: number): [number, number, number] {
  if (t < 0) {
    const intensity = Math.min(1, Math.abs(t) / 30)
    return [0, 0, Math.floor(128 + 127 * intensity)]
  }
  if (t < 20) {
    const ratio = t / 20
    return [0, Math.floor(ratio * 255), 255]
  }
  if (t < 50) {
    const ratio = (t - 20) / 30
    return [0, 255, Math.floor(255 * (1 - ratio))]
  }
  if (t < 100) {
    const ratio = (t - 50) / 50
    return [Math.floor(255 * ratio), 255, 0]
  }
  if (t < 500) {
    const ratio = (t - 100) / 400
    return [255, Math.floor(255 * (1 - ratio)), 0]
  }
  const ratio = Math.min(1, (t - 500) / 500)
  return [255, Math.floor(255 * ratio), Math.floor(255 * ratio)]
}

function renderCanvas2DToScreen(transform: { zoom: number; panX: number; panY: number }): void {
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
