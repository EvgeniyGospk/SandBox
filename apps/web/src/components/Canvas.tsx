import { useRef, useEffect, useCallback, useState } from 'react'
import { useSimulationStore } from '@/stores/simulationStore'
import { useToolStore } from '@/stores/toolStore'
import { WasmParticleEngine } from '@/lib/engine'
import { FpsCounter } from '@/lib/FpsCounter'

// Global engine instance for external access (reset, etc.)
let globalEngine: WasmParticleEngine | null = null
export function getEngine(): WasmParticleEngine | null { return globalEngine }

// Camera reset callback (set by Canvas component)
let resetCameraCallback: (() => void) | null = null
export function resetCamera(): void { resetCameraCallback?.() }

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<WasmParticleEngine | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const isDrawing = useRef(false)
  const isDragging = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  // Phase 4: Zero-allocation FPS counter
  const fpsCounter = useRef(new FpsCounter(20))
  
  // Loading state
  const [isLoading, setIsLoading] = useState(true)
  
  // Camera state (refs to avoid re-renders)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  
  const { isPlaying, speed, gravity, ambientTemperature, setFps, setParticleCount } = useSimulationStore()
  const { selectedElement, brushSize, selectedTool } = useToolStore()

  // Use refs for values accessed in render loop to avoid recreating the loop
  const isPlayingRef = useRef(isPlaying)
  const speedRef = useRef(speed)
  isPlayingRef.current = isPlaying
  speedRef.current = speed

  // Register camera reset callback
  useEffect(() => {
    resetCameraCallback = () => {
      cameraRef.current = { x: 0, y: 0, zoom: 1 }
      engineRef.current?.setTransform(1, 0, 0)
    }
    return () => { resetCameraCallback = null }
  }, [])

  // Sync physics settings with engine
  useEffect(() => {
    const engine = engineRef.current
    if (engine) {
      engine.setSettings({ gravity, ambientTemperature })
    }
  }, [gravity, ambientTemperature])

  // Initialize engine and start render loop
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctxRef.current = ctx

    const { width, height } = container.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    
    canvas.width = width
    canvas.height = height
    
    // Throttle state updates
    let lastStatsUpdate = 0
    const STATS_UPDATE_INTERVAL = 200

    // Render loop
    const startRenderLoop = () => {
      const render = (time: number) => {
        const eng = engineRef.current
        if (!eng) return

        // Calculate smoothed FPS (Phase 4: Zero-allocation)
        const delta = time - lastTimeRef.current
        if (delta > 0) {
          fpsCounter.current.add(1000 / delta)
        }
        lastTimeRef.current = time

        // Step simulation
        if (isPlayingRef.current) {
          const steps = speedRef.current >= 1 ? Math.floor(speedRef.current) : 1
          for (let i = 0; i < steps; i++) {
            eng.step()
          }
        }

        // Render using Smart Rendering (Phase 3: Dirty Rectangles)
        const renderer = eng.getRenderer()
        const memory = eng.memory
        if (renderer && memory) {
          renderer.renderSmart(eng, memory)
        } else {
          // Fallback to full render
          eng.render()
        }

        // Throttle React state updates
        if (time - lastStatsUpdate > STATS_UPDATE_INTERVAL) {
          const avgFps = fpsCounter.current.getAverage() // Zero allocations!
          setFps(avgFps)
          setParticleCount(eng.particleCount)
          lastStatsUpdate = time
        }

        animationRef.current = requestAnimationFrame(render)
      }
      
      animationRef.current = requestAnimationFrame(render)
    }
    
    // Initialize WASM engine
    const initEngine = async () => {
      try {
        console.log('🦀 Loading WASM engine...')
        const engine = await WasmParticleEngine.create(width, height)
        engine.attachRenderer(ctx)
        
        engineRef.current = engine
        globalEngine = engine
        setIsLoading(false)
        console.log('🦀 WasmParticleEngine ready!')
        
        // Start render loop
        startRenderLoop()
      } catch (err) {
        console.error('Failed to load WASM engine:', err)
        setIsLoading(false)
      }
    }
    
    initEngine()

    return () => {
      cancelAnimationFrame(animationRef.current)
      if (engineRef.current) {
        engineRef.current.destroy()
      }
      globalEngine = null
    }
  }, [setFps, setParticleCount])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const { width, height } = container.getBoundingClientRect()
      canvas.width = width
      canvas.height = height

      if (engineRef.current) {
        engineRef.current.resize(width, height)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Get canvas position (screen coordinates)
  const getCanvasPosition = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }, [])

  // Screen -> World coordinate conversion
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current
    return {
      x: Math.floor((sx - cam.x) / cam.zoom),
      y: Math.floor((sy - cam.y) / cam.zoom)
    }
  }, [])

  // Zoom handler (mouse wheel)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const eng = engineRef.current
    if (!eng) return
    e.preventDefault()

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const cam = cameraRef.current
    const newZoom = Math.min(Math.max(cam.zoom * delta, 1), 10) // Min 1x, Max 10x

    // Zoom toward cursor position
    const rect = canvasRef.current!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Adjust pan so point under cursor stays fixed
    const scale = newZoom / cam.zoom
    cam.x = mouseX - (mouseX - cam.x) * scale
    cam.y = mouseY - (mouseY - cam.y) * scale
    cam.zoom = newZoom

    eng.setTransform(cam.zoom, cam.x, cam.y)
  }, [])

  // Draw particles
  const draw = useCallback((x: number, y: number) => {
    const engine = engineRef.current
    if (!engine) return

    const radius = Math.floor(brushSize / 2)

    if (selectedTool === 'eraser') {
      engine.removeParticlesInRadius(x, y, radius)
    } else if (selectedTool === 'brush') {
      engine.addParticlesInRadius(x, y, radius, selectedElement)
    }
  }, [brushSize, selectedElement, selectedTool])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPosition(e)
    lastMousePos.current = { x: e.clientX, y: e.clientY }

    // Middle mouse button (1) or move tool -> pan
    if (selectedTool === 'move' || e.button === 1) {
      isDragging.current = true
      e.preventDefault()
      return
    }

    // Drawing
    isDrawing.current = true
    const worldPos = screenToWorld(pos.x, pos.y)
    lastPos.current = worldPos
    draw(worldPos.x, worldPos.y)
  }, [getCanvasPosition, screenToWorld, draw, selectedTool])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPosition(e)

    // Pan mode
    if (isDragging.current) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      
      const cam = cameraRef.current
      cam.x += dx
      cam.y += dy
      
      if (engineRef.current) {
        engineRef.current.setTransform(cam.zoom, cam.x, cam.y)
      }
      
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      return
    }

    // Drawing mode
    if (!isDrawing.current) return
    
    const worldPos = screenToWorld(pos.x, pos.y)
    
    // Interpolate between last position and current (in world space)
    if (lastPos.current) {
      const dx = worldPos.x - lastPos.current.x
      const dy = worldPos.y - lastPos.current.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const steps = Math.max(1, Math.floor(dist))
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = Math.floor(lastPos.current.x + dx * t)
        const y = Math.floor(lastPos.current.y + dy * t)
        draw(x, y)
      }
    }
    
    lastPos.current = worldPos
  }, [getCanvasPosition, screenToWorld, draw])

  const handleMouseUp = useCallback(() => {
    isDrawing.current = false
    isDragging.current = false
    lastPos.current = null
  }, [])

  const handleMouseLeave = useCallback(() => {
    isDrawing.current = false
    isDragging.current = false
    lastPos.current = null
  }, [])

  // Get cursor class
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
          <div className="text-white text-lg">🦀 Loading WASM engine...</div>
        </div>
      )}
      
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${getCursorClass()}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  )
}
