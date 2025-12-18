import { debugWarn, logError } from '@/platform/logging/log'
import { BASE_STEP_MS, MAX_DT_MS, MAX_STEPS_PER_FRAME, STATS_INTERVAL_MS as STATS_INTERVAL, FPS_SAMPLES } from '@/features/simulation/engine/timing'

import type { WorkerContext } from './context'

import { updateMemoryViews } from './memory'
import { processSharedInput } from './input'
import { renderFrame } from './render'
import { sendStats } from './stats'
import { canRecoverFromCrash, postWorkerCrash } from './errors'

function renderLoop(ctx: WorkerContext, token: number, time: number): void {
  if (token !== ctx.loopToken) return

  const state = ctx.state
  const hasWebGL = state.render.useWebGL && state.render.renderer && state.wasm.engine && state.render.canvas && state.wasm.memory
  const hasCanvas2D = !state.render.useWebGL && state.render.ctx && state.render.screenCtx && state.wasm.engine && state.render.canvas

  if (!hasWebGL && !hasCanvas2D) {
    requestAnimationFrame((t) => renderLoop(ctx, token, t))
    return
  }

  const world = state.wasm.engine
  if (!world) {
    requestAnimationFrame((t) => renderLoop(ctx, token, t))
    return
  }

  const dtMs = state.timing.lastTime > 0 ? time - state.timing.lastTime : 0
  if (dtMs > 0) {
    state.timing.fpsBuffer[state.timing.fpsIndex] = 1000 / dtMs
    state.timing.fpsIndex = (state.timing.fpsIndex + 1) % FPS_SAMPLES
    if (state.timing.fpsCount < FPS_SAMPLES) state.timing.fpsCount++
  }
  state.timing.lastTime = time

  processSharedInput(ctx)

  if (state.sim.isPlaying) {
    try {
      const clampedDt = Math.min(dtMs, MAX_DT_MS)
      const safeSpeed = Number.isFinite(state.settings.speed) && state.settings.speed > 0 ? state.settings.speed : 1

      state.sim.stepAccumulator += (safeSpeed * clampedDt) / BASE_STEP_MS
      let steps = Math.floor(state.sim.stepAccumulator)
      if (steps > MAX_STEPS_PER_FRAME) {
        steps = MAX_STEPS_PER_FRAME
        state.sim.stepAccumulator = Math.min(Math.max(state.sim.stepAccumulator - steps, 0), 1)
      } else {
        state.sim.stepAccumulator -= steps
      }

      for (let i = 0; i < steps; i++) {
        world.step()
      }
      ctx.metrics.lastFrameSteps = steps
      ctx.metrics.stepsSinceLastStats += steps
      ctx.metrics.framesSinceLastStats += 1
      updateMemoryViews(ctx)
    } catch (e) {
      logError('💥 WASM simulation crashed:', e)
      state.sim.isPlaying = false
      state.sim.isCrashed = true
      postWorkerCrash({
        message: String(e),
        error: e,
        canRecover: canRecoverFromCrash(e),
        extra: { phase: 'step' },
      })
    }
  }

  try {
    renderFrame(ctx)
  } catch (e) {
    debugWarn('renderFrame failed:', e)
    updateMemoryViews(ctx)
    if (state.render.renderer) state.render.renderer.requestFullUpload()
  }

  if (time - state.timing.lastStatsUpdate > STATS_INTERVAL) {
    sendStats(ctx)
    state.timing.lastStatsUpdate = time
  }

  requestAnimationFrame((t) => renderLoop(ctx, token, t))
}

export function startRenderLoop(ctx: WorkerContext): void {
  const token = ++ctx.loopToken
  requestAnimationFrame((t) => renderLoop(ctx, token, t))
}
