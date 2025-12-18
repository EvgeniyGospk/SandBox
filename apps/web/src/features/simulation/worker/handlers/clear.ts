import type { WorkerContext } from '../context'

export function handleClear(ctx: WorkerContext): void {
  const state = ctx.state
  if (!state.wasm.engine) return
  state.wasm.engine.clear()
  state.sim.isPlaying = false
  state.sim.stepAccumulator = 0
}
