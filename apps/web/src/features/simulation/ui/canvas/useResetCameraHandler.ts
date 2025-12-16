import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { WorkerBridge } from '@/core/engine/worker'
import type { WasmParticleEngine } from '@/core/engine'
import { setResetCameraHandler } from '@/core/canvas/canvasControls'
import type { CameraState } from './useCanvasRefs'

export function useResetCameraHandler(args: {
  cameraRef: MutableRefObject<CameraState>
  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>
}): void {
  const { cameraRef, bridgeRef, engineRef } = args

  useEffect(() => {
    setResetCameraHandler(() => {
      cameraRef.current = { x: 0, y: 0, zoom: 1 }
      bridgeRef.current?.setTransform(1, 0, 0)
      engineRef.current?.setTransform(1, 0, 0)
    })

    return () => setResetCameraHandler(null)
  }, [bridgeRef, cameraRef, engineRef])
}
