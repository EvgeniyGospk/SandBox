import { useRef, useEffect, useCallback, useState } from 'react'
import { useSimulationStore } from '@/stores/simulationStore'
import { useToolStore } from '@/stores/toolStore'
import { WorkerBridge, isWorkerSupported } from '@/lib/engine/WorkerBridge'
import { WasmParticleEngine } from '@/lib/engine'
import { screenToWorld as invertTransform, solvePanForZoom } from '@/lib/engine/transform'

// Global bridge for external access (reset, etc.)
let globalBridge: WorkerBridge | null = null
let globalEngine: WasmParticleEngine | null = null // Fallback

export function getEngine(): WasmParticleEngine | null { return globalEngine }
export function getBridge(): WorkerBridge | null { return globalBridge }

// Camera reset callback
let resetCameraCallback: (() => void) | null = null
export function resetCamera(): void { resetCameraCallback?.() }

// Clear simulation callback
let clearSimulationCallback: (() => void) | null = null
export function clearSimulation(): void { clearSimulationCallback?.() }

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
  
  // Input state
  const isDrawing = useRef(false)
  const isDragging = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
  
  // Loading state
  const [isLoading, setIsLoading] = useState(true)
  const [useWorker, setUseWorker] = useState(true)
  
  // Camera state (stored on main thread for coordinate conversion)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  
  // FIX 2: Достаем renderMode из стора
  const { isPlaying, speed, gravity, ambientTemperature, renderMode, setFps, setParticleCount } = useSimulationStore()
  const { selectedElement, brushSize, selectedTool } = useToolStore()

  // Register callbacks
  useEffect(() => {
    resetCameraCallback = () => {
      cameraRef.current = { x: 0, y: 0, zoom: 1 }
      if (bridgeRef.current) {
        bridgeRef.current.setTransform(1, 0, 0)
      } else if (engineRef.current) {
        engineRef.current.setTransform(1, 0, 0)
      }
    }
    
    clearSimulationCallback = () => {
      if (bridgeRef.current) {
        bridgeRef.current.clear()
      } else if (engineRef.current) {
        engineRef.current.clear()
      }
    }
    
    return () => { 
      resetCameraCallback = null 
      clearSimulationCallback = null
    }
  }, [])

  // Sync play/pause state with worker
  useEffect(() => {
    if (bridgeRef.current) {
      if (isPlaying) {
        bridgeRef.current.play()
      } else {
        bridgeRef.current.pause()
      }
    }
  }, [isPlaying])

  // FIX 2: Sync renderMode (Thermal Vision)
  useEffect(() => {
    if (bridgeRef.current) {
      bridgeRef.current.setRenderMode(renderMode)
    } else if (engineRef.current) {
      engineRef.current.setRenderMode(renderMode)
    }
  }, [renderMode])

  // Sync physics settings
  useEffect(() => {
    if (bridgeRef.current) {
      bridgeRef.current.setSettings({ gravity, ambientTemperature, speed })
    } else if (engineRef.current) {
      engineRef.current.setSettings({ gravity, ambientTemperature })
    }
  }, [gravity, ambientTemperature, speed])

  // Initialize engine (Worker or Fallback)
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const { width, height } = container.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    
    canvas.width = width
    canvas.height = height
    
    const workerSupported = isWorkerSupported()
    setUseWorker(workerSupported)
    
    if (workerSupported) {
      // === PHASE 1: WORKER MODE ===
      const bridge = new WorkerBridge()
      bridgeRef.current = bridge
      globalBridge = bridge
      
      // Setup callbacks
      bridge.onStats = (stats) => {
        setFps(stats.fps)
        setParticleCount(stats.particleCount)
      }
      
      bridge.onReady = () => {
        console.log('🚀 Worker ready! Physics runs in separate thread.')
        setIsLoading(false)
        // Auto-play on ready
        if (isPlaying) {
          bridge.play()
        }
      }
      
      bridge.onError = (msg) => {
        console.error('Worker error:', msg)
        // Fall back to main thread mode
        setUseWorker(false)
        initFallbackEngine(canvas, width, height)
      }
      
      // Initialize worker with canvas
      bridge.init(canvas, width, height).catch((err) => {
        console.warn('Worker init failed, falling back:', err)
        setUseWorker(false)
        initFallbackEngine(canvas, width, height)
      })
      
    } else {
      // === FALLBACK: MAIN THREAD MODE ===
      initFallbackEngine(canvas, width, height)
    }

    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.destroy()
        bridgeRef.current = null
        globalBridge = null
      }
      if (engineRef.current) {
        engineRef.current.destroy()
        engineRef.current = null
        globalEngine = null
      }
    }
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
      
      engineRef.current = engine
      globalEngine = engine
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
      
      // Step simulation
      if (isPlaying) {
        const steps = speed >= 1 ? Math.floor(speed) : 1
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

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current
      if (!container) return

      const { width, height } = container.getBoundingClientRect()
      
      if (bridgeRef.current) {
        bridgeRef.current.resize(width, height)
      } else if (engineRef.current) {
        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = width
          canvas.height = height
        }
        engineRef.current.resize(width, height)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // === INPUT HANDLERS ===

  const getCanvasPosition = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }, [])

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const cam = cameraRef.current
    const viewport = { width: canvas.width, height: canvas.height }

    const world = invertTransform(
      sx,
      sy,
      { zoom: cam.zoom, panX: cam.x, panY: cam.y },
      viewport
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

      // Worker mode: send screen coordinates, worker converts to world
      bridgeRef.current.handleInput(screenX, screenY, radius, selectedElement, selectedTool)
    } else if (engineRef.current) {
      // Fallback: convert to world and call engine
      const worldPos = screenToWorld(screenX, screenY)
      if (selectedTool === 'eraser') {
        engineRef.current.removeParticlesInRadius(worldPos.x, worldPos.y, radius)
      } else if (selectedTool === 'brush') {
        engineRef.current.addParticlesInRadius(worldPos.x, worldPos.y, radius, selectedElement)
      }
    }
  }, [brushSize, selectedElement, selectedTool, screenToWorld])

  // Zoom handler - uses native event (not React) to allow preventDefault
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const cam = cameraRef.current
    const newZoom = Math.min(Math.max(cam.zoom * delta, 0.1), 10)

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const viewport = { width: canvas.width, height: canvas.height }
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
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPosition(e)
    lastMousePos.current = { x: e.clientX, y: e.clientY }

    // Pan mode
    if (selectedTool === 'move' || e.button === 1) {
      isDragging.current = true
      e.preventDefault()
      return
    }

    // Drawing
    isDrawing.current = true
    lastPos.current = pos
    draw(pos.x, pos.y)
  }, [getCanvasPosition, draw, selectedTool])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPosition(e)

    // Pan mode
    if (isDragging.current) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      
      const cam = cameraRef.current
      cam.x += dx
      cam.y += dy
      
      if (bridgeRef.current) {
        bridgeRef.current.setTransform(cam.zoom, cam.x, cam.y)
      } else if (engineRef.current) {
        engineRef.current.setTransform(cam.zoom, cam.x, cam.y)
      }
      
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Drawing mode
    if (!isDrawing.current) return
    
    // Phase 5: Send raw events to Worker. Worker does Bresenham interpolation!
    // No need for client-side interpolation anymore.
    draw(pos.x, pos.y)
    lastPos.current = pos
  }, [getCanvasPosition, draw])

  const handleMouseUp = useCallback(() => {
    // CRITICAL: Reset Bresenham tracking in Worker to prevent lines between strokes!
    if (isDrawing.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
    isDrawing.current = false
    isDragging.current = false
    lastPos.current = null
  }, [])

  const handleMouseLeave = useCallback(() => {
    // Also reset Bresenham on mouse leave
    if (isDrawing.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
    isDrawing.current = false
    isDragging.current = false
    lastPos.current = null
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
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-10">
          <div className="text-white text-lg">
            {useWorker ? '🚀 Starting WebWorker...' : '🦀 Loading WASM engine...'}
          </div>
        </div>
      )}
      
      {/* Worker mode indicator (dev only) */}
      {!isLoading && process.env.NODE_ENV === 'development' && (
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
