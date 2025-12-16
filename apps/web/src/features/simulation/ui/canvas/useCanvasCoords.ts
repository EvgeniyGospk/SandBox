import type { MutableRefObject, RefObject } from 'react'
import type { WorkerBridge } from '@/core/engine/worker'
import type { WasmParticleEngine } from '@/core/engine'
import { screenToWorld as invertTransform } from '@/core/engine/transform'
import type { CameraState, ViewportSize } from './useCanvasRefs'

export function useCanvasCoords(args: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewportSizeRef: MutableRefObject<ViewportSize>
  cameraRef: MutableRefObject<CameraState>
  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>
}): {
  getCanvasPosition: (e: { clientX: number; clientY: number }) => { x: number; y: number }
  screenToWorld: (sx: number, sy: number) => { x: number; y: number }
} {
  const { canvasRef, viewportSizeRef, cameraRef, bridgeRef, engineRef } = args

  const getCanvasPosition = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }

    const viewport = viewportSizeRef.current

    return {
      x: (e.clientX - rect.left) * (viewport.width / rect.width),
      y: (e.clientY - rect.top) * (viewport.height / rect.height),
    }
  }

  const screenToWorld = (sx: number, sy: number) => {
    const cam = cameraRef.current
    const viewport = viewportSizeRef.current

    const worldSize = bridgeRef.current
      ? { width: bridgeRef.current.width, height: bridgeRef.current.height }
      : engineRef.current
        ? { width: engineRef.current.width, height: engineRef.current.height }
        : viewport

    const world = invertTransform(
      sx,
      sy,
      { zoom: cam.zoom, panX: cam.x, panY: cam.y },
      viewport,
      worldSize
    )

    return {
      x: Math.floor(world.x),
      y: Math.floor(world.y),
    }
  }

  return { getCanvasPosition, screenToWorld }
}
