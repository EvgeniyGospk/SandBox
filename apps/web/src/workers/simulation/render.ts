import { state, BG_COLOR_32, EL_EMPTY } from './state'
import { renderNormal } from './rendering/normal'
import { renderThermal } from './rendering/thermal'
import { renderCanvas2DToScreen } from './rendering/canvas2d'
import { maybeLogDirtyDebug } from './rendering/debugDirty'

export function renderFrame(): void {
  if (state.isCrashed || !state.engine || !state.canvas) return

  const transform = { zoom: state.zoom, panX: state.panX, panY: state.panY }

  if (state.renderMode === 'thermal') {
    if (!state.ctx || !state.pixels || !state.imageData || !state.memoryManager) return

    renderThermal(state)
    state.ctx.putImageData(state.imageData, 0, 0)

    if (state.useWebGL && state.renderer) {
      state.renderer.renderThermal(state.imageData, transform)
      return
    }

    renderCanvas2DToScreen(state, transform)
    return
  }

  if (state.useWebGL && state.renderer && state.wasmMemory) {
    maybeLogDirtyDebug(state)

    state.renderer.renderWithDirtyRects(state.engine, state.wasmMemory, transform)
    return
  }

  if (!state.ctx || !state.pixels32 || !state.imageData || !state.memoryManager) return

  renderNormal(state, BG_COLOR_32, EL_EMPTY)
  state.ctx.putImageData(state.imageData, 0, 0)
  renderCanvas2DToScreen(state, transform)
}
