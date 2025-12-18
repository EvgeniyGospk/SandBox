import { useEffect, useCallback, useState } from 'react'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'
import { useToolStore } from '@/features/tools/model/toolStore'
import { ELEMENT_ID_TO_NAME } from '@/features/simulation/engine/api/types'

import { initSimulationBackend } from '@/features/simulation/ui/canvas/initSimulationBackend'
import { useCanvasCoords } from '@/features/simulation/ui/canvas/useCanvasCoords'
import { useCanvasMouseHandlers } from '@/features/simulation/ui/canvas/useCanvasMouseHandlers'
import { useCanvasWheelZoom } from '@/features/simulation/ui/canvas/useCanvasWheelZoom'
import { useCanvasRefs } from '@/features/simulation/ui/canvas/useCanvasRefs'
import { useResetCameraHandler } from '@/features/simulation/ui/canvas/useResetCameraHandler'
import { useLoadContentBundleHandler } from '@/features/simulation/ui/canvas/useLoadContentBundleHandler'
import { useViewportResize } from '@/features/simulation/ui/canvas/useViewportResize'
import { useWorldSizePresetResize } from '@/features/simulation/ui/canvas/useWorldSizePresetResize'

/**
 * Canvas Component - Phase 1: WebWorker Architecture
 * 
 * Main thread only handles:
 * - User input (mouse events)
 * - Camera state
 * - React state updates (FPS, particle count)
 * 
 * Worker handles:
 * - WASM engine
 * - Physics simulation
 * - Rendering to OffscreenCanvas
 */
export function Canvas() {
  const { refs, overlay } = useCanvasRefs()
  const {
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
  } = refs
  const { isLoading, setIsLoading, useWorker, setUseWorker, error, setError, warning, setWarning } = overlay

  const [restartToken, setRestartToken] = useState(0)

  const restartSimulation = useCallback(() => {
    setError(null)
    setWarning(null)
    setIsLoading(true)
    setRestartToken((v) => v + 1)
  }, [setError, setIsLoading, setWarning])
  
  // FIX 2: Достаем renderMode из стора
  const {
    isPlaying,
    speed,
    gravity,
    ambientTemperature,
    renderMode,
    worldSizePreset,
    setFps,
    setParticleCount,
    setBackend,
    captureSnapshotForUndo,
  } = useSimulationStore()
  const { 
    selectedElementId, 
    brushSize, 
    brushShape, 
    selectedTool,
  } = useToolStore()

  const { getCanvasPosition, screenToWorld } = useCanvasCoords({
    canvasRef,
    viewportSizeRef,
    cameraRef,
    bridgeRef,
    engineRef,
  })

  // Zoom handler - uses native event (not React) to allow preventDefault
  // Attach wheel listener with passive: false (React can't do this)
  useCanvasWheelZoom({
    canvasRef,
    viewportSizeRef,
    cameraRef,
    bridgeRef,
    engineRef,
    canvasMountToken: restartToken,
  })

  // Expose "reset view" control for UI (TopToolbar)
  useResetCameraHandler({ cameraRef, bridgeRef, engineRef })

  useLoadContentBundleHandler({ bridgeRef, engineRef })

  // Initialize engine (Worker or Fallback)
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    return initSimulationBackend({
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
      setWarning,
      setBackend,

      setFps,
      setParticleCount,
    })
  // worldSizePreset is read on mount (changes only happen in menu before game starts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartToken])

  // Apply world size preset changes during gameplay (recreates world + clears simulation).
  useWorldSizePresetResize({
    containerRef,
    worldSizePreset,

    bridgeRef,
    engineRef,

    pendingWorldResizeRef,
    initialWorldSizeRef,

    setParticleCount,
  })

  // Handle resize - only resize world if preset is 'full'
  useViewportResize({
    containerRef,
    canvasRef,
    viewportSizeRef,

    canvasTransferredRef,

    bridgeRef,
    engineRef,

    worldSizePreset,
  })

  // === INPUT HANDLERS ===

  // Draw particles (send to worker or call engine directly)
  const draw = useCallback((screenX: number, screenY: number) => {
    const radius = Math.floor(brushSize / 2)
    
    if (bridgeRef.current) {
      const cam = cameraRef.current
      
      bridgeRef.current.setTransform(cam.zoom, cam.x, cam.y)

      // Fill is one-shot, handle separately
      if (selectedTool === 'fill') {
        bridgeRef.current.fill(screenX, screenY, selectedElementId)
      } else {
        // Worker mode: send screen coordinates, worker converts to world
        if (selectedTool === 'brush' || selectedTool === 'eraser') {
          bridgeRef.current.handleInput(screenX, screenY, radius, selectedElementId, selectedTool, brushShape)
        }
      }
    } else if (engineRef.current) {
      // Fallback: convert to world and call engine
      const worldPos = screenToWorld(screenX, screenY)
      const selectedElement = ELEMENT_ID_TO_NAME[selectedElementId] ?? 'empty'
      if (selectedTool === 'eraser') {
        engineRef.current.removeParticlesInRadius(worldPos.x, worldPos.y, radius)
      } else if (selectedTool === 'brush') {
        if (brushShape === 'square') {
          const half = Math.max(1, radius)
          for (let dy = -half; dy <= half; dy++) {
            for (let dx = -half; dx <= half; dx++) {
              engineRef.current.addParticlesInRadius(worldPos.x + dx, worldPos.y + dy, 1, selectedElement)
            }
          }
        } else if (brushShape === 'line') {
          engineRef.current.addParticlesInRadius(worldPos.x, worldPos.y, radius, selectedElement)
        } else {
          engineRef.current.addParticlesInRadius(worldPos.x, worldPos.y, radius, selectedElement)
        }
      } else if (selectedTool === 'fill') {
        engineRef.current.floodFill(worldPos.x, worldPos.y, selectedElement)
      }
    }
  }, [brushSize, brushShape, selectedElementId, selectedTool, screenToWorld, bridgeRef, cameraRef, engineRef])

  // Mouse handlers
  const baseMouseHandlers = useCanvasMouseHandlers({
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
  })

  const handleMouseDown = baseMouseHandlers.handleMouseDown
  const handleMouseMove = baseMouseHandlers.handleMouseMove

  const handleMouseUp = useCallback(() => {
    // CRITICAL: Reset Bresenham tracking in Worker to prevent lines between strokes!
    baseMouseHandlers.handleMouseUp()
  }, [baseMouseHandlers])

  const handleMouseLeave = useCallback(() => {
    // Also reset Bresenham on mouse leave
    baseMouseHandlers.handleMouseLeave()
  }, [baseMouseHandlers])

  const getCursorClass = () => baseMouseHandlers.cursorClass

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full bg-[#0a0a0a] overflow-hidden relative"
    >
      {warning && !error && (
        <div className="absolute top-2 left-2 z-20 max-w-md bg-yellow-900/40 border border-yellow-500 rounded-lg px-3 py-2 text-xs text-yellow-100">
          <div className="flex items-start gap-2">
            <div className="flex-1">{warning}</div>
            <button
              onClick={() => setWarning(null)}
              className="text-yellow-200 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 z-20">
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-6 max-w-md text-center">
            <div className="text-red-400 text-lg mb-4">⚠️ Simulation Error</div>
            <div className="text-white mb-4">{error}</div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={restartSimulation}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Restart Simulation
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-lg transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-10">
          <div className="text-white text-lg">
            {useWorker ? '🚀 Starting WebWorker...' : '🦀 Loading WASM engine...'}
          </div>
        </div>
      )}
      
	      {/* Worker mode indicator (dev only) */}
	      {!isLoading && import.meta.env.DEV && (
	        <div className="absolute top-2 right-2 text-xs text-gray-500 z-10">
	          {useWorker ? '🚀 Worker' : '🦀 Main Thread'}
	        </div>
	      )}
      
      <canvas
        ref={canvasRef}
        key={restartToken}
        className={`w-full h-full ${getCursorClass()}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
