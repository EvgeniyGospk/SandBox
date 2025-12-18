import type { WorkerContext } from './context'

export function sendStats(ctx: WorkerContext): void {
  const state = ctx.state
  let sum = 0
  for (let i = 0; i < state.timing.fpsCount; i++) {
    sum += state.timing.fpsBuffer[i]
  }
  const avgFps = state.timing.fpsCount > 0 ? sum / state.timing.fpsCount : 0

  const particleCount = state.wasm.engine?.particle_count ?? 0

  const stepsPerFrame = ctx.metrics.framesSinceLastStats > 0 ? ctx.metrics.stepsSinceLastStats / ctx.metrics.framesSinceLastStats : 0
  const wasmMemoryBytes = state.wasm.memory?.buffer.byteLength ?? 0

  self.postMessage({
    type: 'STATS',
    fps: Math.round(avgFps),
    particleCount,
    stepsPerFrame,
    inputOverflowCount: ctx.metrics.inputOverflowCountSinceLastStats,
    wasmMemoryBytes,
  })

  ctx.metrics.stepsSinceLastStats = 0
  ctx.metrics.framesSinceLastStats = 0
  ctx.metrics.inputOverflowCountSinceLastStats = 0
}
