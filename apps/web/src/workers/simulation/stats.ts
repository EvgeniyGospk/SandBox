import { state } from './state'

export function sendStats(): void {
  let sum = 0
  for (let i = 0; i < state.fpsCount; i++) {
    sum += state.fpsBuffer[i]
  }
  const avgFps = state.fpsCount > 0 ? sum / state.fpsCount : 0

  const particleCount = state.engine?.particle_count ?? 0

  self.postMessage({
    type: 'STATS',
    fps: Math.round(avgFps),
    particleCount,
  })
}
