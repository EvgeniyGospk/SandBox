import { useRef, useState } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { WorkerBridge } from '@/features/simulation/engine/worker'
import type { WasmParticleEngine } from '@/features/simulation/engine'

export type ViewportSize = { width: number; height: number }
export type WorldSize = { width: number; height: number }
export type CameraState = { x: number; y: number; zoom: number }

export type CanvasRefs = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  containerRef: RefObject<HTMLDivElement | null>

  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>

  viewportSizeRef: MutableRefObject<ViewportSize>
  pendingWorldResizeRef: MutableRefObject<WorldSize | null>
  initialWorldSizeRef: MutableRefObject<WorldSize | null>
  canvasTransferredRef: MutableRefObject<boolean>

  cameraRef: MutableRefObject<CameraState>

  isDrawingRef: MutableRefObject<boolean>
  isDraggingRef: MutableRefObject<boolean>
  lastMousePosRef: MutableRefObject<{ x: number; y: number }>
}

export type CanvasOverlayState = {
  isLoading: boolean
  setIsLoading: (v: boolean) => void

  useWorker: boolean
  setUseWorker: (v: boolean) => void

  error: string | null
  setError: (v: string | null) => void
}

export function useCanvasRefs(): { refs: CanvasRefs; overlay: CanvasOverlayState } {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const bridgeRef = useRef<WorkerBridge | null>(null)
  const engineRef = useRef<WasmParticleEngine | null>(null)

  const viewportSizeRef = useRef<ViewportSize>({ width: 0, height: 0 })
  const pendingWorldResizeRef = useRef<WorldSize | null>(null)
  const initialWorldSizeRef = useRef<WorldSize | null>(null)
  const canvasTransferredRef = useRef(false)

  const cameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 })

  const isDrawingRef = useRef(false)
  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  const [isLoading, setIsLoading] = useState(true)
  const [useWorker, setUseWorker] = useState(true)
  const [error, setError] = useState<string | null>(null)

  return {
    refs: {
      canvasRef,
      containerRef,
      bridgeRef,
      engineRef,
      viewportSizeRef,
      pendingWorldResizeRef,
      initialWorldSizeRef,
      canvasTransferredRef,
      cameraRef,
      isDrawingRef,
      isDraggingRef,
      lastMousePosRef,
    },
    overlay: {
      isLoading,
      setIsLoading,
      useWorker,
      setUseWorker,
      error,
      setError,
    },
  }
}
