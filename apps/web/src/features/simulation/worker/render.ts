import type { WorkerContext } from './context'

import { BG_COLOR_32, EL_EMPTY } from './state'
import { renderNormal } from './rendering/normal'
import { renderThermal } from './rendering/thermal'
import { renderCanvas2DToScreen } from './rendering/canvas2d'

export function renderFrame(ctx: WorkerContext): void {
  const state = ctx.state
  if (state.sim.isCrashed || !state.wasm.engine || !state.render.canvas) return

  const transform = state.view.transform

  if (state.render.mode === 'thermal') {
    if (!state.render.ctx || !state.render.pixels || !state.render.imageData || !state.memory.manager) return

    renderThermal(state)
    state.render.ctx.putImageData(state.render.imageData, 0, 0)

    if (state.render.useWebGL && state.render.renderer) {
      state.render.renderer.renderThermal(state.render.imageData, transform)
      return
    }

    renderCanvas2DToScreen(state, transform)
    return
  }

  if (state.render.useWebGL && state.render.renderer && state.wasm.memory) {
    state.render.renderer.render(state.wasm.engine, state.wasm.memory, transform)
    return
  }

  if (!state.render.ctx || !state.render.pixels32 || !state.render.imageData || !state.memory.manager) return

  renderNormal(state, BG_COLOR_32, EL_EMPTY)
  state.render.ctx.putImageData(state.render.imageData, 0, 0)
  renderCanvas2DToScreen(state, transform)
}
