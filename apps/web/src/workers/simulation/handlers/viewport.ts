import type { SetViewportMessage } from '../types'
import { state } from '../state'

export function handleSetViewport(msg: SetViewportMessage): void {
  if (!state.canvas) return

  const w = Math.max(1, Math.floor(msg.width))
  const h = Math.max(1, Math.floor(msg.height))
  if (w === state.viewportWidth && h === state.viewportHeight) return

  state.viewportWidth = w
  state.viewportHeight = h

  state.canvas.width = w
  state.canvas.height = h

  if (state.useWebGL && state.renderer) {
    state.renderer.setViewportSize(w, h)
  } else if (state.screenCtx) {
    state.screenCtx.imageSmoothingEnabled = false
  }
}
