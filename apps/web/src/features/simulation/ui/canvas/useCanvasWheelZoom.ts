import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { WorkerBridge } from '@/core/engine/worker'
import type { WasmParticleEngine } from '@/core/engine'
import { solvePanForZoom } from '@/core/engine/transform'
import type { CameraState, ViewportSize } from './useCanvasRefs'

export function useCanvasWheelZoom(args: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewportSizeRef: MutableRefObject<ViewportSize>
  cameraRef: MutableRefObject<CameraState>
  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>
}): void {
  const { canvasRef, viewportSizeRef, cameraRef, bridgeRef, engineRef } = args

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()

      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const cam = cameraRef.current
      const newZoom = Math.min(Math.max(cam.zoom * delta, 0.1), 10)

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const viewport = viewportSizeRef.current
      const mouseX = (e.clientX - rect.left) * (viewport.width / rect.width)
      const mouseY = (e.clientY - rect.top) * (viewport.height / rect.height)

      const nextCam = solvePanForZoom(
        mouseX,
        mouseY,
        newZoom,
        { zoom: cam.zoom, panX: cam.x, panY: cam.y },
        viewport
      )

      cam.x = nextCam.panX
      cam.y = nextCam.panY
      cam.zoom = nextCam.zoom

      if (bridgeRef.current) {
        bridgeRef.current.setTransform(cam.zoom, cam.x, cam.y)
      } else if (engineRef.current) {
        engineRef.current.setTransform(cam.zoom, cam.x, cam.y)
      }
    },
    [bridgeRef, cameraRef, canvasRef, engineRef, viewportSizeRef]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [canvasRef, handleWheel])
}
