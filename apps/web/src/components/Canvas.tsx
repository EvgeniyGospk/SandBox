import { useRef, useEffect, useCallback, useState } from 'react'
import { useSimulationStore, getWorldSize } from '@/stores/simulationStore'
import { useToolStore } from '@/stores/toolStore'
import { WorkerBridge, isWorkerSupported } from '@/lib/engine/WorkerBridge'
import { WasmParticleEngine } from '@/lib/engine'
import { screenToWorld as invertTransform, solvePanForZoom } from '@/lib/engine/transform'
import { ELEMENT_ID_TO_NAME } from '@/lib/engine/generated_elements'
import * as SimulationController from '@/lib/engine/SimulationController'
import { setBridge, setEngine } from '@/lib/engine/runtime'
import { setResetCameraHandler } from '@/lib/canvasControls'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bridgeRef = useRef<WorkerBridge | null>(null)
  const engineRef = useRef<WasmParticleEngine | null>(null) // Fallback
  const viewportSizeRef = useRef({ width: 0, height: 0 })
  
	  // Input state
	  const isDrawing = useRef(false)
	  const isDragging = useRef(false)
	  const lastMousePos = useRef({ x: 0, y: 0 })
  
  // Loading state
  const [isLoading, setIsLoading] = useState(true)
  const [useWorker, setUseWorker] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasTransferred = useRef(false)
  
  // Camera state (stored on main thread for coordinate conversion)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  
  // FIX 2: Достаем renderMode из стора
  const { isPlaying, speed, gravity, ambientTemperature, renderMode, worldSizePreset, setFps, setParticleCount } = useSimulationStore()
  const { 
    selectedElement, 
    brushSize, 
    brushShape, 
    selectedTool,
  } = useToolStore()

  // Expose "reset view" control for UI (TopToolbar)
  useEffect(() => {
    setResetCameraHandler(() => {
      cameraRef.current = { x: 0, y: 0, zoom: 1 }
      bridgeRef.current?.setTransform(1, 0, 0)
      engineRef.current?.setTransform(1, 0, 0)
    })
    return () => setResetCameraHandler(null)
  }, [])

  // Initialize engine (Worker or Fallback)
  useEffect(() => {
    let canceled = false

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const viewportRect = container.getBoundingClientRect()
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return

    const dpr = window.devicePixelRatio || 1
    const viewportWidth = Math.max(1, Math.floor(viewportRect.width * dpr))
    const viewportHeight = Math.max(1, Math.floor(viewportRect.height * dpr))
    viewportSizeRef.current = { width: viewportWidth, height: viewportHeight }
    
    // Get world size based on preset (may be smaller than viewport for FPS boost)
    const worldSize = getWorldSize(worldSizePreset, { width: viewportRect.width, height: viewportRect.height })
    const worldWidth = Math.max(1, Math.floor(worldSize.width))
    const worldHeight = Math.max(1, Math.floor(worldSize.height))
    
    // Canvas = viewport size (for display)
    canvas.width = viewportWidth
    canvas.height = viewportHeight
    
    console.log(`🌍 World Size: ${worldWidth}x${worldHeight} (preset: ${worldSizePreset})`)
    
    const workerSupported = isWorkerSupported()
    setUseWorker(workerSupported)
    
    if (workerSupported) {
      // === PHASE 1: WORKER MODE ===
      const bridge = new WorkerBridge()
      bridgeRef.current = bridge
      setBridge(bridge)
      setEngine(null)
      
      // Setup callbacks
      bridge.onStats = (stats) => {
        if (canceled) return
        setFps(stats.fps)
        setParticleCount(stats.particleCount)
      }
      
      bridge.onReady = () => {
        if (canceled) return
        console.log('🚀 Worker ready! Physics runs in separate thread.')
        // Ensure current UI state is applied (messages may have been sent before init)
        bridge.setSettings({ gravity, ambientTemperature, speed })
        bridge.setRenderMode(renderMode)
        if (isPlaying) bridge.play()
        setIsLoading(false)
      }
      
      bridge.onError = (msg) => {
        if (canceled) return
        console.error('Worker error:', msg)
        canvasTransferred.current = bridge.hasTransferred
        setError(`Simulation error: ${msg}. Please refresh the page.`)
        setIsLoading(false)
      }
      
      bridge.onCrash = (msg) => {
        if (canceled) return
        console.error('Worker crash:', msg)
        canvasTransferred.current = bridge.hasTransferred
        setError(`Simulation crashed: ${msg}. Please refresh the page.`)
        setIsLoading(false)
      }
      
      // Initialize worker with WORLD + VIEWPORT sizes
      const initPromise = bridge.init(canvas, worldWidth, worldHeight, viewportWidth, viewportHeight)
      canvasTransferred.current = bridge.hasTransferred

      initPromise
        .then(() => {
          canvasTransferred.current = bridge.hasTransferred
        })
        .catch((err) => {
          canvasTransferred.current = bridge.hasTransferred
          console.warn('Worker init failed:', err)

          // If transfer failed, we can still fall back to main-thread mode.
          if (!bridge.hasTransferred) {
            bridge.destroy()
            bridgeRef.current = null
            setBridge(null)
            setUseWorker(false)
            initFallbackEngine(canvas, worldWidth, worldHeight)
            return
          }

          setError(`Failed to initialize: ${err.message}. Please refresh.`)
          setIsLoading(false)
        })
      
    } else {
      // === FALLBACK: MAIN THREAD MODE ===
      setBridge(null)
      initFallbackEngine(canvas, worldWidth, worldHeight)
    }

    return () => {
      canceled = true
      if (bridgeRef.current) {
        bridgeRef.current.destroy()
        bridgeRef.current = null
        setBridge(null)
      }
      if (engineRef.current) {
        engineRef.current.destroy()
        engineRef.current = null
        setEngine(null)
      }
      canvasTransferred.current = false
    }
  // worldSizePreset is read on mount (changes only happen in menu before game starts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fallback engine initialization (main thread)
	  const initFallbackEngine = async (canvas: HTMLCanvasElement, width: number, height: number) => {
	    try {
	      console.log('🦀 Fallback: Loading WASM in main thread...')
	      const ctx = canvas.getContext('2d', { alpha: false })
	      if (!ctx) throw new Error('No 2d context')
	      
	      const engine = await WasmParticleEngine.create(width, height)
	      engine.attachRenderer(ctx)
	      engine.setSettings({ gravity, ambientTemperature })
	      engine.setRenderMode(renderMode)
	      
	      engineRef.current = engine
	      setEngine(engine)
	      setBridge(null)
	      canvasTransferred.current = false
	      setIsLoading(false)
	      console.log('🦀 Fallback engine ready!')
	      
	      // Start main thread render loop
	      startFallbackRenderLoop(engine, ctx)
    } catch (err) {
      console.error('Failed to load WASM engine:', err)
      setIsLoading(false)
    }
  }
  
  // Main thread render loop (fallback)
	  const startFallbackRenderLoop = (engine: WasmParticleEngine, _ctx: CanvasRenderingContext2D) => {
	    let lastStatsUpdate = 0
	    const STATS_INTERVAL = 200
	    
	    const render = (time: number) => {
	      if (!engineRef.current) return
	      const { isPlaying: playing, speed: currentSpeed } = useSimulationStore.getState()
	      
	      // Step simulation
	      if (playing) {
	        const steps = currentSpeed >= 1 ? Math.floor(currentSpeed) : 1
	        for (let i = 0; i < steps; i++) {
	          engine.step()
	        }
	      }
      
      // Render
      const renderer = engine.getRenderer()
      const memory = engine.memory
      if (renderer && memory) {
        renderer.renderSmart(engine, memory)
      } else {
        engine.render()
      }
      
      // Stats update
      if (time - lastStatsUpdate > STATS_INTERVAL) {
        setFps(60) // Approximate
        setParticleCount(engine.particleCount)
        lastStatsUpdate = time
      }
      
      requestAnimationFrame(render)
    }
    
    requestAnimationFrame(render)
  }

	  // Handle resize - only resize world if preset is 'full'
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
	      if (!canvasTransferred.current) {
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
	  // worldSizePreset read on mount only
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [])

  // === INPUT HANDLERS ===

	  const getCanvasPosition = useCallback((e: React.MouseEvent) => {
	    const canvas = canvasRef.current
	    if (!canvas) return { x: 0, y: 0 }
	    
	    const rect = canvas.getBoundingClientRect()
	    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
	    const viewport = viewportSizeRef.current
	    return {
	      x: (e.clientX - rect.left) * (viewport.width / rect.width),
	      y: (e.clientY - rect.top) * (viewport.height / rect.height)
	    }
	  }, [])

	  const screenToWorld = useCallback((sx: number, sy: number) => {
	    const cam = cameraRef.current
	    const viewport = viewportSizeRef.current
	    
	    // Get world size from bridge or engine
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
      y: Math.floor(world.y)
    }
  }, [])

  // Draw particles (send to worker or call engine directly)
	  const draw = useCallback((screenX: number, screenY: number) => {
	    const radius = Math.floor(brushSize / 2)
	    
	    if (bridgeRef.current) {
	      const cam = cameraRef.current
	      
	      bridgeRef.current.setTransform(cam.zoom, cam.x, cam.y)

	      // Fill is one-shot, handle separately
	      if (selectedTool === 'fill') {
	        bridgeRef.current.fill(screenX, screenY, selectedElement)
	      } else {
	        // Worker mode: send screen coordinates, worker converts to world
	        if (selectedTool === 'brush' || selectedTool === 'eraser') {
	          bridgeRef.current.handleInput(screenX, screenY, radius, selectedElement, selectedTool, brushShape)
	        }
	      }
	    } else if (engineRef.current) {
      // Fallback: convert to world and call engine
      const worldPos = screenToWorld(screenX, screenY)
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
	  }, [brushSize, brushShape, selectedElement, selectedTool, screenToWorld])

  // Zoom handler - uses native event (not React) to allow preventDefault
	  const handleWheel = useCallback((e: WheelEvent) => {
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
	  }, [])

  // Attach wheel listener with passive: false (React can't do this)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

	  // Mouse handlers
	  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
	    const pos = getCanvasPosition(e)
	    lastMousePos.current = pos

	    // Pan mode
	    if (selectedTool === 'move' || e.button === 1) {
	      isDragging.current = true
      e.preventDefault()
      return
    }

    // Pipette
    if (selectedTool === 'pipette') {
      if (bridgeRef.current) {
        bridgeRef.current.pipette(pos.x, pos.y)
          .then((el) => { if (el) useToolStore.getState().setElement(el) })
      } else if (engineRef.current) {
        const world = screenToWorld(pos.x, pos.y)
        const elId = engineRef.current.getElementAt(world.x, world.y)
        const el = ELEMENT_ID_TO_NAME[elId] ?? null
        if (el) useToolStore.getState().setElement(el)
      }
	      return
		    }

		    const isOneShotTool = selectedTool === 'fill' || selectedTool === 'rigid_body'
		    await SimulationController.captureSnapshotForUndo()

		    if (isOneShotTool) {
		      draw(pos.x, pos.y)
		      return
		    }

	    // Continuous drawing
	    isDrawing.current = true
	    draw(pos.x, pos.y)
	  }, [getCanvasPosition, screenToWorld, draw, selectedTool])

	  const handleMouseMove = useCallback((e: React.MouseEvent) => {
	    const pos = getCanvasPosition(e)

	    // Pan mode
	    if (isDragging.current) {
	      const dx = pos.x - lastMousePos.current.x
	      const dy = pos.y - lastMousePos.current.y
	      
	      const cam = cameraRef.current
	      cam.x += dx
	      cam.y += dy
      
      if (bridgeRef.current) {
        bridgeRef.current.setTransform(cam.zoom, cam.x, cam.y)
      } else if (engineRef.current) {
        engineRef.current.setTransform(cam.zoom, cam.x, cam.y)
      }
      
	      lastMousePos.current = pos
	      return
	    }

    // Drawing mode
    if (!isDrawing.current) return
    
	    // Phase 5: Send raw events to Worker. Worker does Bresenham interpolation!
	    // No need for client-side interpolation anymore.
	    draw(pos.x, pos.y)
	  }, [getCanvasPosition, draw])

  const handleMouseUp = useCallback(() => {
    // CRITICAL: Reset Bresenham tracking in Worker to prevent lines between strokes!
    if (isDrawing.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
	    isDrawing.current = false
	    isDragging.current = false
	  }, [])

  const handleMouseLeave = useCallback(() => {
    // Also reset Bresenham on mouse leave
    if (isDrawing.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
	    isDrawing.current = false
	    isDragging.current = false
	  }, [])

  const getCursorClass = () => {
    switch (selectedTool) {
      case 'eraser': return 'cursor-cell'
      case 'pipette': return 'cursor-copy'
      case 'move': return 'cursor-grab'
      default: return 'cursor-crosshair'
    }
  }

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full bg-[#0a0a0a] overflow-hidden relative"
    >
      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/90 z-20">
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-6 max-w-md text-center">
            <div className="text-red-400 text-lg mb-4">⚠️ Simulation Error</div>
            <div className="text-white mb-4">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
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
