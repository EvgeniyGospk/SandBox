import type { RenderModeMessage } from '../types'
import type { WorkerContext } from '../context'

export function handleRenderMode(ctx: WorkerContext, msg: RenderModeMessage): void {
  const state = ctx.state
  state.render.mode = msg.mode
  if (state.render.mode === 'normal' && state.render.useWebGL && state.render.renderer) {
    state.render.renderer.requestFullUpload()
  }
}
