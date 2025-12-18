import type { MutableRefObject } from 'react'
import type { WasmParticleEngine } from '@/features/simulation/engine'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'
import { BASE_STEP_MS, FPS_SAMPLES, MAX_DT_MS, MAX_STEPS_PER_FRAME, STATS_INTERVAL_MS } from '@/features/simulation/engine/timing'

export function startFallbackRenderLoop(args: {
  engineRef: MutableRefObject<WasmParticleEngine | null>
  setFps: (fps: number) => void
  setParticleCount: (count: number) => void
}): void {
  const { engineRef, setFps, setParticleCount } = args

  let lastStatsUpdate = 0
  let lastTime = 0
  let stepAccumulator = 0
  const fpsBuffer = new Float32Array(FPS_SAMPLES)
  let fpsIndex = 0
  let fpsCount = 0

  const render = (time: number) => {
    const engine = engineRef.current
    if (!engine) return

    const { isPlaying: playing, speed: currentSpeed } = useSimulationStore.getState()

    const dtMs = lastTime > 0 ? time - lastTime : 0
    lastTime = time

    if (dtMs > 0) {
      fpsBuffer[fpsIndex] = 1000 / dtMs
      fpsIndex = (fpsIndex + 1) % FPS_SAMPLES
      if (fpsCount < FPS_SAMPLES) fpsCount++
    }

    if (playing) {
      const clampedDt = Math.min(dtMs, MAX_DT_MS)
      const safeSpeed = Number.isFinite(currentSpeed) && currentSpeed > 0 ? currentSpeed : 1
      stepAccumulator += (safeSpeed * clampedDt) / BASE_STEP_MS

      let steps = Math.floor(stepAccumulator)
      if (steps > MAX_STEPS_PER_FRAME) {
        steps = MAX_STEPS_PER_FRAME
        stepAccumulator = 0
      } else {
        stepAccumulator -= steps
      }

      for (let i = 0; i < steps; i++) {
        engine.step()
      }
    }

    engine.render()

    if (time - lastStatsUpdate > STATS_INTERVAL_MS) {
      let sum = 0
      for (let i = 0; i < fpsCount; i++) sum += fpsBuffer[i]
      const avgFps = fpsCount > 0 ? sum / fpsCount : 0
      setFps(Math.round(avgFps))
      setParticleCount(engine.particleCount)
      lastStatsUpdate = time
    }

    requestAnimationFrame(render)
  }

  requestAnimationFrame(render)
}
