import type { WorkerContext } from '../context'
import { floodFill } from '../tools'

export function handleFill(ctx: WorkerContext, msg: { type: 'FILL'; x: number; y: number; elementId: number }): void {
  const state = ctx.state
  if (!state.wasm.engine || !state.memory.manager) return
  floodFill(ctx, msg.x, msg.y, Math.max(0, Math.min(255, Math.floor(msg.elementId))))
}
