import { useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { WorkerBridge } from '@/core/engine/worker'
import type { WasmParticleEngine } from '@/core/engine'
import type { ViewportSize } from './useCanvasRefs'

export function useViewportResize(args: {
  containerRef: RefObject<HTMLDivElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewportSizeRef: MutableRefObject<ViewportSize>

  canvasTransferredRef: MutableRefObject<boolean>

  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>

  worldSizePreset: 'tiny' | 'small' | 'medium' | 'large' | 'full'
}): void {
  const {
    containerRef,
    canvasRef,
    viewportSizeRef,
    canvasTransferredRef,
    bridgeRef,
    engineRef,
    worldSizePreset,
  } = args

  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      const viewportRect = container.getBoundingClientRect()
      if (viewportRect.width <= 0 || viewportRect.height <= 0) return

      const dpr = window.devicePixelRatio || 1
      const viewportWidth = Math.max(1, Math.floor(viewportRect.width * dpr))
      const viewportHeight = Math.max(1, Math.floor(viewportRect.height * dpr))
      viewportSizeRef.current = { width: viewportWidth, height: viewportHeight }

      // Always update canvas to match viewport.
      // If canvas was transferred to an OffscreenCanvas (worker mode),
      // resizing the DOM canvas throws InvalidStateError.
      if (!canvasTransferredRef.current) {
        canvas.width = viewportWidth
        canvas.height = viewportHeight
      }

      // Keep worker's viewport in sync (world size may be fixed!)
      bridgeRef.current?.setViewportSize(viewportWidth, viewportHeight)

      // Only resize world if preset is 'full' (viewport-dependent)
      if (worldSizePreset === 'full') {
        const worldWidth = Math.max(1, Math.floor(viewportRect.width))
        const worldHeight = Math.max(1, Math.floor(viewportRect.height))
        if (bridgeRef.current) {
          bridgeRef.current.resize(worldWidth, worldHeight)
        } else if (engineRef.current) {
          engineRef.current.resize(worldWidth, worldHeight)
        }
      }
      // For fixed presets, world size stays the same - just viewport changes
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [worldSizePreset])
}
