import { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'
import { WebGLRenderer } from '@/features/simulation/engine/rendering/WebGLRenderer'
import { debugLog, debugWarn, logError } from '@/platform/logging/log'
import { SIMULATION_PROTOCOL_VERSION } from '@/features/simulation/engine/protocol/index'

import type { WasmInitOutput } from './types'
import type { WorkerContext } from './context'
import { resetWorkerContext } from './context'
import { postWorkerError } from './errors'
import { applyCurrentSettingsToEngine, updateMemoryViews } from './memory'
import { startRenderLoop } from './loop'

function postContentBundleStatus(args: {
  phase: 'init' | 'reload'
  status: 'loading' | 'loaded' | 'error'
  message?: string
}): void {
  self.postMessage({ type: 'CONTENT_BUNDLE_STATUS', ...args })
}

export async function initEngine(
  ctx: WorkerContext,
  initCanvas: OffscreenCanvas,
  width: number,
  height: number,
  vpWidth?: number,
  vpHeight?: number,
  inputBuffer?: SharedArrayBuffer
): Promise<void> {
  // Cancel any in-flight render loop immediately (INIT is allowed to be retried)
  ctx.loopToken += 1

  // Best-effort cleanup of previous resources before resetting state
  try {
    ctx.state.render.renderer?.destroy()
  } catch {
    // ignore
  }

  resetWorkerContext(ctx)

  const state = ctx.state

  try {
    state.render.canvas = initCanvas

    const worldWidth = Math.max(1, Math.floor(width))
    const worldHeight = Math.max(1, Math.floor(height))

    state.view.viewportWidth = Math.max(1, Math.floor(vpWidth ?? worldWidth))
    state.view.viewportHeight = Math.max(1, Math.floor(vpHeight ?? worldHeight))

    initCanvas.width = state.view.viewportWidth
    initCanvas.height = state.view.viewportHeight

    if (inputBuffer) {
      state.input.sharedBuffer = new SharedInputBuffer(inputBuffer)
      debugLog('🚀 Worker: Using SharedArrayBuffer for input (zero-latency)')
    }

    const wasm = await import('@particula/engine-wasm/particula_engine')
    const wasmExports: WasmInitOutput = await wasm.default()

    state.wasm.module = wasm
    state.wasm.memory = wasmExports.memory

    if (!state.wasm.memory) {
      logError('WASM memory not found! Exports:', Object.keys(wasmExports))
      throw new Error('WASM memory not available')
    }

    debugLog(`🚀 Worker: WASM memory size: ${state.wasm.memory.buffer.byteLength} bytes`)

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

    state.wasm.engine = new wasm.World(worldWidth, worldHeight)
    {
      const raw = import.meta.env.VITE_CHUNK_SLEEPING
      const str = raw === undefined ? '' : String(raw).toLowerCase().trim()
      const enabled = str === '' || (str !== '0' && str !== 'false' && str !== 'off')
      const engine = state.wasm.engine as unknown as { set_chunk_sleeping_enabled?: (enabled: boolean) => void }
      engine.set_chunk_sleeping_enabled?.(enabled)
      if (!enabled) {
        debugLog('🧩 Worker: Chunk sleeping disabled via VITE_CHUNK_SLEEPING')
      }
    }

    try {
      postContentBundleStatus({ phase: 'init', status: 'loading' })
      const res = await fetch('/content/bundle.json', { cache: 'no-store' })
      if (!res.ok) {
        debugWarn(`Worker: Failed to fetch /content/bundle.json (status=${res.status})`)
        postContentBundleStatus({
          phase: 'init',
          status: 'error',
          message: `Failed to fetch /content/bundle.json (status=${res.status})`,
        })
      } else {
        const json = await res.text()
        const engine = state.wasm.engine as unknown as {
          load_content_bundle?: (json: string) => void
          get_content_manifest_json?: () => string
          getContentManifestJson?: () => string
        }
        if (engine.load_content_bundle) {
          engine.load_content_bundle(json)
          debugLog('Worker: Content bundle loaded')

          postContentBundleStatus({ phase: 'init', status: 'loaded' })

          const getManifest = engine.get_content_manifest_json ?? engine.getContentManifestJson
          if (getManifest) {
            const manifestJson = getManifest()
            self.postMessage({ type: 'CONTENT_MANIFEST', json: manifestJson })
          } else {
            debugWarn('Worker: WASM build does not expose get_content_manifest_json')
          }
        } else {
          debugWarn('Worker: WASM build does not expose load_content_bundle')
          postContentBundleStatus({
            phase: 'init',
            status: 'error',
            message: 'WASM build does not expose load_content_bundle',
          })
        }
      }
    } catch (e) {
      debugWarn('Worker: Failed to load content bundle:', e)
      postContentBundleStatus({
        phase: 'init',
        status: 'error',
        message: e instanceof Error ? e.message : 'Failed to load content bundle',
      })
    }

    applyCurrentSettingsToEngine(ctx)

    try {
      state.render.renderer = new WebGLRenderer(initCanvas, worldWidth, worldHeight)
      state.render.useWebGL = true
      state.render.screenCtx = null
      // Ensure WebGL texture is fully initialized on the first frame.
      // Otherwise untouched chunks may remain transparent (alpha=0) and show through the clear color,
      // producing visible per-chunk "lighting" artifacts as chunks get uploaded over time.
      state.render.renderer.requestFullUpload()
      debugLog('🎮 Worker: WebGL 2.0 Renderer active!')
    } catch (e) {
      debugWarn('WebGL not available, falling back to Canvas2D:', e)
      state.render.useWebGL = false
      state.render.renderer = null
      state.render.screenCtx = initCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      }) as OffscreenCanvasRenderingContext2D | null
      if (!state.render.screenCtx) {
        throw new Error('Canvas2D not available')
      }
      state.render.screenCtx.imageSmoothingEnabled = false
    }

    state.render.thermalCanvas = new OffscreenCanvas(worldWidth, worldHeight)
    state.render.ctx = state.render.thermalCanvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    }) as OffscreenCanvasRenderingContext2D | null

    if (state.render.ctx) {
      state.render.ctx.imageSmoothingEnabled = false
      state.render.imageData = new ImageData(worldWidth, worldHeight)
      state.render.pixels = state.render.imageData.data
      state.render.pixels32 = new Uint32Array(state.render.pixels.buffer)
      debugLog('🌡️ Worker: Thermal mode canvas ready')
    }

    debugLog(`🚀 Worker: Canvas ${worldWidth}x${worldHeight}, Mode: ${state.render.useWebGL ? 'WebGL' : 'Canvas2D'}`)

    updateMemoryViews(ctx)

    debugLog('🚀 Worker: Engine initialized!')

    self.postMessage({
      type: 'READY',
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      width: worldWidth,
      height: worldHeight,
      capabilities: {
        webgl: state.render.useWebGL,
        sharedInput: state.input.sharedBuffer !== null,
      },
    })

    startRenderLoop(ctx)
  } catch (error) {
    logError('Worker init error:', error)
    try {
      state.render.renderer?.destroy()
    } catch {
      // ignore
    }
    resetWorkerContext(ctx)
    postWorkerError({ message: String(error), error, extra: { phase: 'init' } })
  }
}
