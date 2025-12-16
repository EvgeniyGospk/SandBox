import type { MutableRefObject } from 'react'
import { isWorkerSupported, type WorkerBridge } from '@/core/engine/worker'
import type { WasmParticleEngine } from '@/core/engine'
import { debugLog } from '@/core/logging/log'
import type { ISimulationBackend } from '@/core/engine/ISimulationBackend'
import type { ViewportSize, WorldSize } from './useCanvasRefs'
import { cleanupSimulationBackend } from './init/cleanup'
import { initFallbackBackend } from './init/fallbackBackend'
import { applyInitialSizing } from './init/sizing'
import { initWorkerBackend } from './init/workerBackend'

export function initSimulationBackend(args: {
  canvas: HTMLCanvasElement
  container: HTMLDivElement

  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>

  viewportSizeRef: MutableRefObject<ViewportSize>
  pendingWorldResizeRef: MutableRefObject<WorldSize | null>
  initialWorldSizeRef: MutableRefObject<WorldSize | null>
  canvasTransferredRef: MutableRefObject<boolean>

  worldSizePreset: 'tiny' | 'small' | 'medium' | 'large' | 'full'
  gravity: { x: number; y: number }
  ambientTemperature: number
  speed: number
  renderMode: 'normal' | 'thermal'
  isPlaying: boolean

  setUseWorker: (v: boolean) => void
  setIsLoading: (v: boolean) => void
  setError: (v: string | null) => void
  setBackend: (backend: ISimulationBackend | null) => void

  setFps: (fps: number) => void
  setParticleCount: (count: number) => void
}): () => void {
  const {
    canvas,
    container,
    bridgeRef,
    engineRef,
    viewportSizeRef,
    pendingWorldResizeRef,
    initialWorldSizeRef,
    canvasTransferredRef,
    worldSizePreset,
    gravity,
    ambientTemperature,
    speed,
    renderMode,
    isPlaying,
    setUseWorker,
    setIsLoading,
    setError,
    setBackend,
    setFps,
    setParticleCount,
  } = args

  let canceled = false

  const isCanceled = () => canceled

  const sizing = applyInitialSizing({
    canvas,
    container,
    viewportSizeRef,
    initialWorldSizeRef,
    worldSizePreset,
  })

  if (!sizing) {
    return () => {
      canceled = true
    }
  }

  const { viewportWidth, viewportHeight, worldWidth, worldHeight } = sizing

  debugLog(`🌍 World Size: ${worldWidth}x${worldHeight} (preset: ${worldSizePreset})`)

  const initFallbackEngine = (w: number, h: number) => {
    void initFallbackBackend({
      canvas,
      width: w,
      height: h,
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
    })
  }

  const workerSupported = isWorkerSupported()
  setUseWorker(workerSupported)

  if (workerSupported) {
    initWorkerBackend({
      canvas,
      worldWidth,
      worldHeight,
      viewportWidth,
      viewportHeight,
      gravity,
      ambientTemperature,
      speed,
      renderMode,
      isPlaying,
      bridgeRef,
      pendingWorldResizeRef,
      canvasTransferredRef,
      isCanceled,
      setBackend,
      setUseWorker,
      setIsLoading,
      setError,
      setFps,
      setParticleCount,
      initFallback: initFallbackEngine,
    })
  } else {
    setBackend(null)
    initFallbackEngine(worldWidth, worldHeight)
  }

  return () => {
    canceled = true

    cleanupSimulationBackend({ bridgeRef, engineRef, setBackend, canvasTransferredRef })
  }
}
