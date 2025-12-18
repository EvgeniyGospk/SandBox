import { updateMemoryViews } from '../memory'
import type { WorkerContext } from '../context'

export function handleStep(ctx: WorkerContext): void {
  const state = ctx.state
  if (!state.wasm.engine) return
  state.wasm.engine.step()
  updateMemoryViews(ctx)
}
