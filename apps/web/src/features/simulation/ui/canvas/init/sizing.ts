import { getWorldSize } from '@/features/simulation/model/simulationStore'
import type { MutableRefObject } from 'react'
import type { ViewportSize, WorldSize } from '../useCanvasRefs'

export function applyInitialSizing(args: {
  canvas: HTMLCanvasElement
  container: HTMLDivElement

  viewportSizeRef: MutableRefObject<ViewportSize>
  initialWorldSizeRef: MutableRefObject<WorldSize | null>

  worldSizePreset: 'tiny' | 'small' | 'medium' | 'large' | 'full'
}):
  | {
      viewportWidth: number
      viewportHeight: number
      worldWidth: number
      worldHeight: number
    }
  | null {
  const { canvas, container, viewportSizeRef, initialWorldSizeRef, worldSizePreset } = args

  const viewportRect = container.getBoundingClientRect()
  if (viewportRect.width <= 0 || viewportRect.height <= 0) return null

  const dpr = window.devicePixelRatio || 1
  const viewportWidth = Math.max(1, Math.floor(viewportRect.width * dpr))
  const viewportHeight = Math.max(1, Math.floor(viewportRect.height * dpr))
  viewportSizeRef.current = { width: viewportWidth, height: viewportHeight }

  const worldSize = getWorldSize(worldSizePreset, { width: viewportRect.width, height: viewportRect.height })
  const worldWidth = Math.max(1, Math.floor(worldSize.width))
  const worldHeight = Math.max(1, Math.floor(worldSize.height))
  initialWorldSizeRef.current = { width: worldWidth, height: worldHeight }

  canvas.width = viewportWidth
  canvas.height = viewportHeight

  return { viewportWidth, viewportHeight, worldWidth, worldHeight }
}
