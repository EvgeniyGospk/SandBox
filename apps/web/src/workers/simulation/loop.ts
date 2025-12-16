import { debugWarn, logError } from '../../core/logging/log'
import { BASE_STEP_MS, MAX_DT_MS, MAX_STEPS_PER_FRAME, STATS_INTERVAL_MS as STATS_INTERVAL, FPS_SAMPLES } from '../../core/engine/timing'

import { state } from './state'
import { updateMemoryViews } from './memory'
import { processSharedInput } from './input'
import { renderFrame } from './render'
import { sendStats } from './stats'

export function renderLoop(time: number): void {
  const hasWebGL = state.useWebGL && state.renderer && state.engine && state.canvas && state.wasmMemory
  const hasCanvas2D = !state.useWebGL && state.ctx && state.screenCtx && state.engine && state.canvas

  if (!hasWebGL && !hasCanvas2D) {
    requestAnimationFrame(renderLoop)
    return
  }

  const world = state.engine
  if (!world) {
    requestAnimationFrame(renderLoop)
    return
  }

  const dtMs = state.lastTime > 0 ? time - state.lastTime : 0
  if (dtMs > 0) {
    state.fpsBuffer[state.fpsIndex] = 1000 / dtMs
    state.fpsIndex = (state.fpsIndex + 1) % FPS_SAMPLES
    if (state.fpsCount < FPS_SAMPLES) state.fpsCount++
  }
  state.lastTime = time

  processSharedInput()

  if (state.isPlaying) {
    try {
      const clampedDt = Math.min(dtMs, MAX_DT_MS)
      const safeSpeed = Number.isFinite(state.speed) && state.speed > 0 ? state.speed : 1

      state.stepAccumulator += (safeSpeed * clampedDt) / BASE_STEP_MS
      let steps = Math.floor(state.stepAccumulator)
      if (steps > MAX_STEPS_PER_FRAME) {
        steps = MAX_STEPS_PER_FRAME
        state.stepAccumulator = 0
      } else {
        state.stepAccumulator -= steps
      }

      for (let i = 0; i < steps; i++) {
        world.step()
      }
      updateMemoryViews()
    } catch (e) {
      logError('💥 WASM simulation crashed:', e)
      state.isPlaying = false
      state.isCrashed = true
      self.postMessage({
        type: 'CRASH',
        message: String(e),
        canRecover: false,
      })
    }
  }

  try {
    renderFrame()
  } catch (e) {
    debugWarn('renderFrame failed:', e)
    updateMemoryViews()
    if (state.renderer) state.renderer.requestFullUpload()
  }

  if (time - state.lastStatsUpdate > STATS_INTERVAL) {
    sendStats()
    state.lastStatsUpdate = time
  }

  requestAnimationFrame(renderLoop)
}
