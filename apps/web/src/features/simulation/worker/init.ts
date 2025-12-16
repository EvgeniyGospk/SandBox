import { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'
import { WebGLRenderer } from '@/features/simulation/engine/rendering/WebGLRenderer'
import { debugLog, debugWarn, logError } from '@/platform/logging/log'
import { SIMULATION_PROTOCOL_VERSION } from '@/features/simulation/engine/protocol/index'

import type { WasmInitOutput } from './types'
import { state } from './state'
import { applyCurrentSettingsToEngine, updateMemoryViews } from './memory'
import { renderLoop } from './loop'

export async function initEngine(
  initCanvas: OffscreenCanvas,
  width: number,
  height: number,
  vpWidth?: number,
  vpHeight?: number,
  inputBuffer?: SharedArrayBuffer
): Promise<void> {
  try {
    state.canvas = initCanvas

    const worldWidth = Math.max(1, Math.floor(width))
    const worldHeight = Math.max(1, Math.floor(height))

    state.viewportWidth = Math.max(1, Math.floor(vpWidth ?? worldWidth))
    state.viewportHeight = Math.max(1, Math.floor(vpHeight ?? worldHeight))

    initCanvas.width = state.viewportWidth
    initCanvas.height = state.viewportHeight

    if (inputBuffer) {
      state.sharedInputBuffer = new SharedInputBuffer(inputBuffer)
      debugLog('🚀 Worker: Using SharedArrayBuffer for input (zero-latency)')
    }

    const wasm = await import('@particula/engine-wasm/particula_engine')
    const wasmExports: WasmInitOutput = await wasm.default()

    state.wasmModule = wasm
    state.wasmMemory = wasmExports.memory

    if (!state.wasmMemory) {
      logError('WASM memory not found! Exports:', Object.keys(wasmExports))
      throw new Error('WASM memory not available')
    }

    debugLog(`🚀 Worker: WASM memory size: ${state.wasmMemory.buffer.byteLength} bytes`)

    type ThreadPoolInit = (numThreads: number) => Promise<void>
    type WasmThreadPool = { init_thread_pool?: ThreadPoolInit; initThreadPool?: ThreadPoolInit }
    const maybeThreadPool = wasm as unknown as WasmThreadPool
    const initThreadPool = maybeThreadPool.init_thread_pool ?? maybeThreadPool.initThreadPool
    if (initThreadPool) {
      try {
        const numThreads = navigator.hardwareConcurrency || 4
        await initThreadPool(numThreads)
        debugLog(`🧵 Worker: Rayon thread pool initialized with ${numThreads} threads!`)
      } catch (e) {
        debugWarn('Thread pool init failed (parallel disabled):', e)
      }
    }

    state.engine = new wasm.World(worldWidth, worldHeight)
    applyCurrentSettingsToEngine()

    try {
      state.renderer = new WebGLRenderer(initCanvas, worldWidth, worldHeight)
      state.useWebGL = true
      state.screenCtx = null
      debugLog('🎮 Worker: WebGL 2.0 Renderer active!')
    } catch (e) {
      debugWarn('WebGL not available, falling back to Canvas2D:', e)
      state.useWebGL = false
      state.renderer = null
      state.screenCtx = initCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      }) as OffscreenCanvasRenderingContext2D | null
      if (!state.screenCtx) {
        throw new Error('Canvas2D not available')
      }
      state.screenCtx.imageSmoothingEnabled = false
    }

    state.thermalCanvas = new OffscreenCanvas(worldWidth, worldHeight)
    state.ctx = state.thermalCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    }) as OffscreenCanvasRenderingContext2D | null

    if (state.ctx) {
      state.ctx.imageSmoothingEnabled = false
      state.imageData = new ImageData(worldWidth, worldHeight)
      state.pixels = state.imageData.data
      state.pixels32 = new Uint32Array(state.pixels.buffer)
      debugLog('🌡️ Worker: Thermal mode canvas ready')
    }

    debugLog(`🚀 Worker: Canvas ${worldWidth}x${worldHeight}, Mode: ${state.useWebGL ? 'WebGL' : 'Canvas2D'}`)

    updateMemoryViews()

    debugLog('🚀 Worker: Engine initialized!')

    self.postMessage({
      type: 'READY',
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      width: worldWidth,
      height: worldHeight,
      capabilities: {
        webgl: state.useWebGL,
        sharedInput: state.sharedInputBuffer !== null,
      },
    })

    requestAnimationFrame(renderLoop)
  } catch (error) {
    logError('Worker init error:', error)
    self.postMessage({ type: 'ERROR', message: String(error) })
  }
}
