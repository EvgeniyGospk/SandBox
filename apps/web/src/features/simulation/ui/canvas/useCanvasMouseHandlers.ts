import { useCallback } from 'react'
import type { MutableRefObject, MouseEvent as ReactMouseEvent } from 'react'
import type { WorkerBridge } from '@/features/simulation/engine/worker'
import type { WasmParticleEngine } from '@/features/simulation/engine'
import { useToolStore } from '@/features/tools/model/toolStore'
import type { CameraState } from './useCanvasRefs'

export function useCanvasMouseHandlers(args: {
  selectedTool: 'brush' | 'eraser' | 'pipette' | 'fill' | 'move' | 'rigid_body'

  cameraRef: MutableRefObject<CameraState>
  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>

  isDrawingRef: MutableRefObject<boolean>
  isDraggingRef: MutableRefObject<boolean>
  lastMousePosRef: MutableRefObject<{ x: number; y: number }>

  getCanvasPosition: (e: { clientX: number; clientY: number }) => { x: number; y: number }
  screenToWorld: (sx: number, sy: number) => { x: number; y: number }

  draw: (screenX: number, screenY: number) => void
  captureSnapshotForUndo: () => Promise<void>
}): {
  handleMouseDown: (e: ReactMouseEvent) => Promise<void>
  handleMouseMove: (e: ReactMouseEvent) => void
  handleMouseUp: () => void
  handleMouseLeave: () => void
  cursorClass: string
} {
  const {
    selectedTool,
    cameraRef,
    bridgeRef,
    engineRef,
    isDrawingRef,
    isDraggingRef,
    lastMousePosRef,
    getCanvasPosition,
    screenToWorld,
    draw,
    captureSnapshotForUndo,
  } = args

  const handleMouseDown = useCallback(
    async (e: ReactMouseEvent) => {
      const pos = getCanvasPosition(e)
      lastMousePosRef.current = pos

      if (selectedTool === 'move' || e.button === 1) {
        isDraggingRef.current = true
        e.preventDefault()
        return
      }

      if (selectedTool === 'pipette') {
        if (bridgeRef.current) {
          bridgeRef.current.pipette(pos.x, pos.y).then((elementId) => {
            if (elementId !== null) useToolStore.getState().setElementId(elementId)
          })
        } else if (engineRef.current) {
          const world = screenToWorld(pos.x, pos.y)
          const elId = engineRef.current.getElementAt(world.x, world.y)
          useToolStore.getState().setElementId(elId)
        }
        return
      }

      const isOneShotTool = selectedTool === 'fill' || selectedTool === 'rigid_body'
      await captureSnapshotForUndo()

      if (isOneShotTool) {
        draw(pos.x, pos.y)
        return
      }

      isDrawingRef.current = true
      draw(pos.x, pos.y)
    },
    [
      bridgeRef,
      captureSnapshotForUndo,
      draw,
      engineRef,
      getCanvasPosition,
      isDraggingRef,
      isDrawingRef,
      lastMousePosRef,
      screenToWorld,
      selectedTool,
    ]
  )

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      const pos = getCanvasPosition(e)

      if (isDraggingRef.current) {
        const dx = pos.x - lastMousePosRef.current.x
        const dy = pos.y - lastMousePosRef.current.y

        const cam = cameraRef.current
        cam.x += dx
        cam.y += dy

        if (bridgeRef.current) {
          bridgeRef.current.setTransform(cam.zoom, cam.x, cam.y)
        } else if (engineRef.current) {
          engineRef.current.setTransform(cam.zoom, cam.x, cam.y)
        }

        lastMousePosRef.current = pos
        return
      }

      if (!isDrawingRef.current) return

      draw(pos.x, pos.y)
    },
    [
      bridgeRef,
      cameraRef,
      draw,
      engineRef,
      getCanvasPosition,
      isDraggingRef,
      isDrawingRef,
      lastMousePosRef,
    ]
  )

  const handleMouseUp = useCallback(() => {
    if (isDrawingRef.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
    isDrawingRef.current = false
    isDraggingRef.current = false
  }, [bridgeRef, isDraggingRef, isDrawingRef])

  const handleMouseLeave = useCallback(() => {
    if (isDrawingRef.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
    isDrawingRef.current = false
    isDraggingRef.current = false
  }, [bridgeRef, isDraggingRef, isDrawingRef])

  const cursorClass = (() => {
    switch (selectedTool) {
      case 'eraser':
        return 'cursor-cell'
      case 'pipette':
        return 'cursor-copy'
      case 'move':
        return 'cursor-grab'
      default:
        return 'cursor-crosshair'
    }
  })()

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    cursorClass,
  }
}
