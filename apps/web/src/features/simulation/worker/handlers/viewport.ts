import type { SetViewportMessage } from '../types'
import type { WorkerContext } from '../context'

export function handleSetViewport(ctx: WorkerContext, msg: SetViewportMessage): void {
  const state = ctx.state
  if (!state.render.canvas) return

  const w = Math.max(1, Math.floor(msg.width))
  const h = Math.max(1, Math.floor(msg.height))
  if (w === state.view.viewportWidth && h === state.view.viewportHeight) return

  state.view.viewportWidth = w
  state.view.viewportHeight = h

  state.render.canvas.width = w
  state.render.canvas.height = h

  if (state.render.useWebGL && state.render.renderer) {
    state.render.renderer.setViewportSize(w, h)
  } else if (state.render.screenCtx) {
    state.render.screenCtx.imageSmoothingEnabled = false
  }
}
