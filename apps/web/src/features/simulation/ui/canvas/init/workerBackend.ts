import { WorkerBridge } from '@/features/simulation/engine/worker'
import { createWorkerBackend } from '@/features/simulation/engine/backends/backendAdapters'
import type { ISimulationBackend } from '@/features/simulation/engine/api/ISimulationBackend'
import { debugLog, debugWarn, logError } from '@/platform/logging/log'
import type { MutableRefObject } from 'react'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'

export function initWorkerBackend(args: {
  canvas: HTMLCanvasElement
  worldWidth: number
  worldHeight: number
  viewportWidth: number
  viewportHeight: number

  gravity: { x: number; y: number }
  ambientTemperature: number
  speed: number
  renderMode: 'normal' | 'thermal'
  isPlaying: boolean

  bridgeRef: MutableRefObject<WorkerBridge | null>
  pendingWorldResizeRef: MutableRefObject<{ width: number; height: number } | null>
  canvasTransferredRef: MutableRefObject<boolean>

  isCanceled: () => boolean

  setBackend: (backend: ISimulationBackend | null) => void
  setUseWorker: (v: boolean) => void
  setIsLoading: (v: boolean) => void
  setError: (v: string | null) => void
  setWarning: (v: string | null) => void
  setFps: (fps: number) => void
  setParticleCount: (count: number) => void

  initFallback: (w: number, h: number) => void
}): void {
  const {
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
    setWarning,
    setFps,
    setParticleCount,
    initFallback,
  } = args

  const bridge = new WorkerBridge()
  bridgeRef.current = bridge
  setBackend(createWorkerBackend(bridge))

  useSimulationStore.getState().setContentManifestJson(null)
  useSimulationStore.getState().setContentBundleStatus({ phase: 'init', status: 'loading' })

  bridge.onStats = (stats) => {
    if (isCanceled()) return
    setFps(stats.fps)
    setParticleCount(stats.particleCount)
  }

  bridge.onReady = () => {
    if (isCanceled()) return
    debugLog('🚀 Worker ready! Physics runs in separate thread.')
    setWarning(null)
    bridge.setSettings({ gravity, ambientTemperature, speed })
    bridge.setRenderMode(renderMode)
    if (isPlaying) bridge.play()

    const pending = pendingWorldResizeRef.current
    if (pending) {
      pendingWorldResizeRef.current = null
      bridge.resize(pending.width, pending.height)
    }

    setIsLoading(false)
  }

  bridge.onContentManifest = (json) => {
    if (isCanceled()) return
    useSimulationStore.getState().setContentManifestJson(json)
  }

  bridge.onContentBundleStatus = (status) => {
    if (isCanceled()) return
    useSimulationStore.getState().setContentBundleStatus(status)
  }

  bridge.onError = (msg) => {
    if (isCanceled()) return
    logError('Worker error:', msg)
    canvasTransferredRef.current = bridge.hasTransferred
    setError(`Simulation error: ${msg}. You can try restarting the simulation.`)
    setIsLoading(false)
  }

  bridge.onCrash = (msg) => {
    if (isCanceled()) return
    logError('Worker crash:', msg)
    canvasTransferredRef.current = bridge.hasTransferred
    setError(`Simulation crashed: ${msg}. You can try restarting the simulation.`)
    setIsLoading(false)
  }

  const initPromise = bridge.init(canvas, worldWidth, worldHeight, viewportWidth, viewportHeight)
  canvasTransferredRef.current = bridge.hasTransferred

  initPromise
    .then(() => {
      canvasTransferredRef.current = bridge.hasTransferred
    })
    .catch((err) => {
      canvasTransferredRef.current = bridge.hasTransferred
      debugWarn('Worker init failed:', err)

      if (!bridge.hasTransferred) {
        bridge.destroy()
        bridgeRef.current = null
        setBackend(null)
        setUseWorker(false)
        initFallback(worldWidth, worldHeight)
        return
      }

      setError(`Failed to initialize: ${err instanceof Error ? err.message : String(err)}. You can try restarting the simulation.`)
      setIsLoading(false)
    })

  setUseWorker(true)
}
