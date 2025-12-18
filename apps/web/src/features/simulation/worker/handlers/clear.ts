import type { WorkerContext } from '../context'
import { applyCurrentSettingsToEngine } from '../memory'
import { renderFrame } from '../render'

export function handleClear(ctx: WorkerContext): void {
  const state = ctx.state
  if (!state.wasm.engine) return
  const wasPlaying = state.sim.isPlaying
  state.input.sharedBuffer?.drain()
  state.wasm.engine.clear()
  state.sim.stepAccumulator = 0
  state.sim.isPlaying = wasPlaying
  state.input.lastX = null
  state.input.lastY = null
  applyCurrentSettingsToEngine(ctx)
  state.render.renderer?.requestFullUpload()
  try {
    renderFrame(ctx)
  } catch {}
}
