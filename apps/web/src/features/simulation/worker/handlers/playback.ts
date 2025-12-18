import type { WorkerContext } from '../context'

export function handlePlay(ctx: WorkerContext): void {
  ctx.state.sim.isPlaying = true
}

export function handlePause(ctx: WorkerContext): void {
  ctx.state.sim.isPlaying = false
  ctx.state.sim.stepAccumulator = 0
}
