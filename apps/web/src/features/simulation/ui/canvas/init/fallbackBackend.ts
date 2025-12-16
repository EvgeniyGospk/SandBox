import { WasmParticleEngine } from '@/features/simulation/engine'
import { createWasmBackend } from '@/features/simulation/engine/backends/backendAdapters'
import type { ISimulationBackend } from '@/features/simulation/engine/api/ISimulationBackend'
import { logError, debugLog } from '@/platform/logging/log'
import { startFallbackRenderLoop } from '@/features/simulation/ui/canvas/startFallbackRenderLoop'
import type { MutableRefObject } from 'react'

export async function initFallbackBackend(args: {
  canvas: HTMLCanvasElement
  width: number
  height: number

  gravity: { x: number; y: number }
  ambientTemperature: number
  renderMode: 'normal' | 'thermal'

  engineRef: MutableRefObject<WasmParticleEngine | null>
  pendingWorldResizeRef: MutableRefObject<{ width: number; height: number } | null>
  canvasTransferredRef: MutableRefObject<boolean>

  setBackend: (backend: ISimulationBackend | null) => void
  setIsLoading: (v: boolean) => void
  setError: (v: string | null) => void
  setFps: (fps: number) => void
  setParticleCount: (count: number) => void
}): Promise<void> {
  const {
    canvas,
    width,
    height,
    gravity,
    ambientTemperature,
    renderMode,
    engineRef,
    pendingWorldResizeRef,
    canvasTransferredRef,
    setBackend,
    setIsLoading,
    setError,
    setFps,
    setParticleCount,
  } = args

  try {
    debugLog('🦀 Fallback: Loading WASM in main thread...')
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('No 2d context')

    const engine = await WasmParticleEngine.create(width, height)
    engine.attachRenderer(ctx)
    engine.setSettings({ gravity, ambientTemperature })
    engine.setRenderMode(renderMode)

    engineRef.current = engine
    setBackend(createWasmBackend(engine))
    canvasTransferredRef.current = false
    setIsLoading(false)
    debugLog('🦀 Fallback engine ready!')

    const pending = pendingWorldResizeRef.current
    if (pending) {
      pendingWorldResizeRef.current = null
      engine.resize(pending.width, pending.height)
    }

    startFallbackRenderLoop({ engineRef, setFps, setParticleCount })
  } catch (err) {
    logError('Failed to load WASM engine:', err)
    setError(`Simulation error: ${err instanceof Error ? err.message : String(err)}`)
    setIsLoading(false)
  }
}
