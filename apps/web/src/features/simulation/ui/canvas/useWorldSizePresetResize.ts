import { useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { WorkerBridge } from '@/features/simulation/engine/worker'
import type { WasmParticleEngine } from '@/features/simulation/engine'
import { getWorldSize, type WorldSizePreset } from '@/features/simulation/model/simulationStore'
import type { WorldSize } from './useCanvasRefs'

export function useWorldSizePresetResize(args: {
  containerRef: RefObject<HTMLDivElement | null>
  worldSizePreset: WorldSizePreset

  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>

  pendingWorldResizeRef: MutableRefObject<WorldSize | null>
  initialWorldSizeRef: MutableRefObject<WorldSize | null>

  setParticleCount: (count: number) => void
}): void {
  const {
    containerRef,
    worldSizePreset,
    bridgeRef,
    engineRef,
    pendingWorldResizeRef,
    initialWorldSizeRef,
    setParticleCount,
  } = args

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const viewportRect = container.getBoundingClientRect()
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return

    const worldSize = getWorldSize(worldSizePreset, { width: viewportRect.width, height: viewportRect.height })
    const worldWidth = Math.max(1, Math.floor(worldSize.width))
    const worldHeight = Math.max(1, Math.floor(worldSize.height))

    // Worker mode
    const bridge = bridgeRef.current
    if (bridge) {
      if (bridge.width === worldWidth && bridge.height === worldHeight) return
      if (!bridge.isReady) {
        pendingWorldResizeRef.current = { width: worldWidth, height: worldHeight }
        return
      }
      setParticleCount(0)
      bridge.resize(worldWidth, worldHeight)
      return
    }

    // Fallback mode
    const engine = engineRef.current
    if (!engine) {
      const initial = initialWorldSizeRef.current
      if (initial && initial.width === worldWidth && initial.height === worldHeight) return
      pendingWorldResizeRef.current = { width: worldWidth, height: worldHeight }
      return
    }
    if (engine.width === worldWidth && engine.height === worldHeight) return
    setParticleCount(0)
    engine.resize(worldWidth, worldHeight)
  }, [worldSizePreset, setParticleCount, bridgeRef, engineRef, initialWorldSizeRef, pendingWorldResizeRef, containerRef])
}
