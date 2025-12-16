import { debugLog } from '@/platform/logging/log'
import type { ResizeMessage } from '../types'
import { state } from '../state'
import { applyCurrentSettingsToEngine, updateMemoryViews } from '../memory'

export function handleResize(msg: ResizeMessage): void {
  if (!state.engine || !state.wasmModule) return

  const w = Math.max(1, Math.floor(msg.width))
  const h = Math.max(1, Math.floor(msg.height))

  const currentW = state.engine.width as number
  const currentH = state.engine.height as number
  if (w === currentW && h === currentH) return

  state.engine = new state.wasmModule.World(w, h)
  applyCurrentSettingsToEngine()
  state.lastInputX = null
  state.lastInputY = null

  state.thermalCanvas = new OffscreenCanvas(w, h)
  state.ctx = state.thermalCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true,
  }) as OffscreenCanvasRenderingContext2D | null

  if (state.ctx) {
    state.ctx.imageSmoothingEnabled = false
    state.imageData = new ImageData(w, h)
    state.pixels = state.imageData.data
    state.pixels32 = new Uint32Array(state.pixels.buffer)
  }

  if (state.useWebGL && state.renderer) {
    state.renderer.resizeWorld(w, h)
  }

  state.fillVisited = null

  updateMemoryViews()
  debugLog(`⚡ Resized World to: ${w}x${h}`)
}
