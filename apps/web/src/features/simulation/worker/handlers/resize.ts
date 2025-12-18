import { debugLog } from '@/platform/logging/log'
import type { ResizeMessage } from '../types'
import type { WorkerContext } from '../context'
import { applyCurrentSettingsToEngine, updateMemoryViews } from '../memory'

export function handleResize(ctx: WorkerContext, msg: ResizeMessage): void {
  const state = ctx.state
  if (!state.wasm.engine || !state.wasm.module) return

  const w = Math.max(1, Math.floor(msg.width))
  const h = Math.max(1, Math.floor(msg.height))

  const currentW = state.wasm.engine.width as number
  const currentH = state.wasm.engine.height as number
  if (w === currentW && h === currentH) return

  state.wasm.engine = new state.wasm.module.World(w, h)
  applyCurrentSettingsToEngine(ctx)
  state.input.lastX = null
  state.input.lastY = null

  state.render.thermalCanvas = new OffscreenCanvas(w, h)
  state.render.ctx = state.render.thermalCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  }) as OffscreenCanvasRenderingContext2D | null

  if (state.render.ctx) {
    state.render.ctx.imageSmoothingEnabled = false
    state.render.imageData = new ImageData(w, h)
    state.render.pixels = state.render.imageData.data
    state.render.pixels32 = new Uint32Array(state.render.pixels.buffer)
  }

  if (state.render.useWebGL && state.render.renderer) {
    state.render.renderer.resizeWorld(w, h)
  }

  state.fill.visited = null

  updateMemoryViews(ctx)
  debugLog(`⚡ Resized World to: ${w}x${h}`)
}
