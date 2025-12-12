/**
 * Simulation Worker - Runs WASM physics in separate thread
 * 
 * Phase 1 (WebWorker): UI never blocks, physics runs independently
 * Phase 2 (Zero-Copy): Direct memory access via SharedArrayBuffer views
 * 
 * Message Protocol:
 * - Main → Worker: INIT, PLAY, PAUSE, SET_TOOL, INPUT, TRANSFORM, SETTINGS, CLEAR, RESIZE
 * - Worker → Main: READY, STATS, ERROR
 */

import type { ElementType, RenderMode, ToolType } from '../lib/engine/types'

// Phase 5: Import SharedInputBuffer for zero-latency input
import { SharedInputBuffer, INPUT_TYPE_ERASE, INPUT_TYPE_END_STROKE, INPUT_TYPE_BRUSH_OFFSET } from '../lib/InputBuffer'
import { screenToWorld as invertTransform } from '../lib/engine/transform'
import { ELEMENT_NAME_TO_ID, ELEMENT_ID_TO_NAME } from '../lib/engine/generated_elements'

// Phase 3: WebGL Renderer for GPU-accelerated rendering
import { WebGLRenderer } from '../lib/engine/WebGLRenderer'

// Phase 3 (Fort Knox): Safe memory management
import { MemoryManager } from '../lib/engine/MemoryManager'

// Message types
interface InitMessage {
  type: 'INIT'
  canvas: OffscreenCanvas
  width: number           // World width
  height: number          // World height
  viewportWidth?: number  // Viewport width (may differ from world)
  viewportHeight?: number // Viewport height
  inputBuffer?: SharedArrayBuffer // Phase 5: Optional shared input buffer
}

interface InputMessage {
  type: 'INPUT'
  x: number
  y: number
  radius: number
  element: ElementType
  tool: ToolType
  brushShape?: 'circle' | 'square' | 'line'
}

interface TransformMessage {
  type: 'TRANSFORM'
  zoom: number
  panX: number
  panY: number
}

interface SettingsMessage {
  type: 'SETTINGS'
  gravity?: { x: number; y: number }
  ambientTemperature?: number
  speed?: number
}

interface RenderModeMessage {
  type: 'SET_RENDER_MODE'
  mode: RenderMode
}

interface ResizeMessage {
  type: 'RESIZE'
  width: number
  height: number
}

interface SetViewportMessage {
  type: 'SET_VIEWPORT'
  width: number
  height: number
}

type WorkerMessage = 
  | InitMessage
  | InputMessage
  | TransformMessage
  | SettingsMessage
  | RenderModeMessage
  | ResizeMessage
  | SetViewportMessage
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STEP' }   // Single-step when paused
  | { type: 'CLEAR' }
  | { type: 'FILL'; x: number; y: number; element: ElementType }
  | { type: 'PIPETTE'; id: number; x: number; y: number }
  | { type: 'SNAPSHOT'; id: number }
  | { type: 'LOAD_SNAPSHOT'; buffer: ArrayBuffer }
  | { type: 'INPUT_END' }  // Phase 5: Reset Bresenham tracking
  | { type: 'SPAWN_RIGID_BODY'; x: number; y: number; size: number; shape: 'box' | 'circle'; element: ElementType }

// Worker state
let engine: any = null
let wasmModule: any = null
let wasmMemory: WebAssembly.Memory | null = null
let canvas: OffscreenCanvas | null = null

// Phase 3: WebGL Renderer (replaces Canvas2D)
let renderer: WebGLRenderer | null = null
let useWebGL = true // Feature flag for fallback

// Phase 5: Shared input buffer for zero-latency input
let sharedInputBuffer: SharedInputBuffer | null = null

// Canvas2D for thermal mode (and fallback)
let thermalCanvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let screenCtx: OffscreenCanvasRenderingContext2D | null = null
let imageData: ImageData | null = null
let pixels: Uint8ClampedArray | null = null
let pixels32: Uint32Array | null = null

// Phase 3 (Fort Knox): Safe memory manager
let memoryManager: MemoryManager | null = null
let memoryManagerEngine: any = null

// Cached settings (must survive world recreation)
let currentGravity: { x: number; y: number } | null = null
let currentAmbientTemperature: number | null = null

// Flood fill visited stamp buffer (avoids per-call allocations)
let fillVisited: Int32Array | null = null
let fillStamp = 1

// Simulation state
let isPlaying = false
let speed = 1
let renderMode: RenderMode = 'normal'
let isCrashed = false // Prevent cascade of errors after crash

// Camera state
let zoom = 1
let panX = 0
let panY = 0

// Viewport dimensions (may differ from world size!)
let viewportWidth = 0
let viewportHeight = 0

// Animation
// Note: animationFrameId stored but only used for potential future cancellation
let lastTime = 0

// FPS tracking (zero-allocation ring buffer)
const FPS_SAMPLES = 20
const fpsBuffer = new Float32Array(FPS_SAMPLES)
let fpsIndex = 0
let fpsCount = 0

// Stats update throttling
let lastStatsUpdate = 0
const STATS_INTERVAL = 200 // ms

// Constants
const BG_COLOR_32 = 0xFF0A0A0A
const EL_EMPTY = 0

// === DEBUG: Dirty chunk logging (DISABLED for performance) ===
// Enable via VITE_DEBUG_DIRTY=true if needed
const DEBUG_DIRTY = false
let debugLogInterval = 0
const DEBUG_LOG_EVERY = 60

// Element mapping from generated definitions
const ELEMENT_MAP: Record<ElementType, number> = ELEMENT_NAME_TO_ID

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initEngine(
  initCanvas: OffscreenCanvas, 
  width: number, 
  height: number, 
  vpWidth?: number, 
  vpHeight?: number,
  inputBuffer?: SharedArrayBuffer
) {
  try {
    canvas = initCanvas
    
    // Store viewport dimensions (may differ from world size!)
	    viewportWidth = Math.max(1, Math.floor(vpWidth ?? width))
	    viewportHeight = Math.max(1, Math.floor(vpHeight ?? height))
    
    // CRITICAL: Set canvas size to VIEWPORT size (for display)
    // World size may be smaller for performance!
	    canvas.width = viewportWidth
	    canvas.height = viewportHeight
    
    // Phase 5: Setup shared input buffer if provided
    if (inputBuffer) {
      sharedInputBuffer = new SharedInputBuffer(inputBuffer)
      console.log('🚀 Worker: Using SharedArrayBuffer for input (zero-latency)')
    }
    
	    // Import WASM module dynamically
	    // Import the generated entry directly because packages/engine-wasm has no package.json in dev
	    // @ts-expect-error -- Dynamic import in worker via Vite alias
	    const wasm = await import('@particula/engine-wasm/particula_engine')
    const wasmExports = await wasm.default()
    
    wasmModule = wasm
    // CRITICAL: memory is returned from default(), not wasm.memory!
    wasmMemory = wasmExports.memory
    
    if (!wasmMemory) {
      console.error('WASM memory not found! Exports:', Object.keys(wasmExports))
      throw new Error('WASM memory not available')
    }
    
    console.log(`🚀 Worker: WASM memory size: ${wasmMemory.buffer.byteLength} bytes`)
    
    // Phase 5: Initialize Rayon thread pool for parallel processing
    if (wasm.initThreadPool) {
      try {
        const numThreads = navigator.hardwareConcurrency || 4
        await wasm.initThreadPool(numThreads)
        console.log(`🧵 Worker: Rayon thread pool initialized with ${numThreads} threads!`)
      } catch (e) {
        console.warn('Thread pool init failed (parallel disabled):', e)
      }
    }
    
	    // Create world
	    engine = new wasm.World(width, height)
	    applyCurrentSettingsToEngine()
	    
	    // Phase 3: Try WebGL first (GPU-accelerated)
	    try {
	      renderer = new WebGLRenderer(canvas, width, height)
	      useWebGL = true
	      screenCtx = null
	      console.log('🎮 Worker: WebGL 2.0 Renderer active!')
	    } catch (e) {
	      console.warn('WebGL not available, falling back to Canvas2D:', e)
	      useWebGL = false
	      renderer = null
	      screenCtx = canvas.getContext('2d', {
	        alpha: false,
	        desynchronized: true
	      }) as OffscreenCanvasRenderingContext2D | null
	      if (!screenCtx) {
	        throw new Error('Canvas2D not available')
	      }
	      screenCtx.imageSmoothingEnabled = false
	    }
    
    // ALWAYS create Canvas2D resources for thermal mode fallback
    // Create a separate OffscreenCanvas for thermal rendering
    thermalCanvas = new OffscreenCanvas(width, height)
    ctx = thermalCanvas.getContext('2d', { 
      alpha: false,
      desynchronized: true
    }) as OffscreenCanvasRenderingContext2D
    
    if (ctx) {
      ctx.imageSmoothingEnabled = false
      imageData = new ImageData(width, height)
      pixels = imageData.data
      pixels32 = new Uint32Array(pixels.buffer)
      console.log('🌡️ Worker: Thermal mode canvas ready')
    }
    
    console.log(`🚀 Worker: Canvas ${width}x${height}, Mode: ${useWebGL ? 'WebGL' : 'Canvas2D'}`)
    
    // Setup zero-copy memory views
    updateMemoryViews()
    
    console.log('🚀 Worker: Engine initialized!')
    
    // Notify main thread
    self.postMessage({ type: 'READY', width, height })
    
    // Start render loop
    requestAnimationFrame(renderLoop)
    
  } catch (error) {
    console.error('Worker init error:', error)
    self.postMessage({ type: 'ERROR', message: String(error) })
  }
}

function updateMemoryViews() {
  // Phase 3 (Fort Knox): Use MemoryManager for safe view access
  if (!engine || !wasmMemory) return
  
  if (!memoryManager || memoryManagerEngine !== engine) {
    memoryManager = new MemoryManager(wasmMemory, engine)
    memoryManagerEngine = engine
  } else {
    // Refresh views if memory grew
    memoryManager.refresh()
  }
}

function applyCurrentSettingsToEngine() {
  if (!engine) return

  if (currentGravity) {
    engine.set_gravity(currentGravity.x, currentGravity.y)
  }
  if (currentAmbientTemperature !== null) {
    engine.set_ambient_temperature(currentAmbientTemperature)
  }
}

// ============================================================================
// RENDER LOOP
// ============================================================================

	function renderLoop(time: number) {
	  // Check if we have everything needed for rendering
	  const hasWebGL = useWebGL && renderer && engine && canvas && wasmMemory
	  const hasCanvas2D = !useWebGL && ctx && screenCtx && engine && canvas
  
  if (!hasWebGL && !hasCanvas2D) {
    requestAnimationFrame(renderLoop)
    return
  }
  
  // FPS calculation (zero-allocation)
  const delta = time - lastTime
  if (delta > 0) {
    fpsBuffer[fpsIndex] = 1000 / delta
    fpsIndex = (fpsIndex + 1) % FPS_SAMPLES
    if (fpsCount < FPS_SAMPLES) fpsCount++
  }
  lastTime = time
  
  // Phase 5: Process shared input buffer (zero-latency!)
  processSharedInput()
  
  // Physics step (Phase 5: wrapped in try-catch for crash recovery)
  if (isPlaying) {
    try {
      const steps = speed >= 1 ? Math.floor(speed) : 1
      for (let i = 0; i < steps; i++) {
        engine.step()
      }
      // Memory might have grown
      updateMemoryViews()
    } catch (e) {
      // Phase 5: WASM crashed - notify UI and stop simulation
      console.error('💥 WASM simulation crashed:', e)
      isPlaying = false
      isCrashed = true // Prevent further operations
      self.postMessage({
        type: 'CRASH',
        message: String(e),
        canRecover: false // Can't recover after memory corruption
      })
    }
  }
  
  // Render
  renderFrame()
  
  // Send stats (throttled)
  if (time - lastStatsUpdate > STATS_INTERVAL) {
    sendStats()
    lastStatsUpdate = time
  }
  
  requestAnimationFrame(renderLoop)
}

function renderFrame() {
  // Guard against rendering after crash
  if (isCrashed || !engine || !canvas) return
  
  const transform = { zoom, panX, panY }
  
  // Thermal mode path (uses Canvas2D to render, then uploads to WebGL)
  if (renderMode === 'thermal') {
    if (!ctx || !pixels || !imageData || !memoryManager) return
    
    // Render thermal to ImageData
    renderThermal()
    ctx.putImageData(imageData, 0, 0)
    
    // Use WebGL to display with transform (if available)
    if (useWebGL && renderer) {
      renderer.renderThermal(imageData, transform)
      return
    }

    // Canvas2D fallback: blit buffer to screen with transform
    renderCanvas2DToScreen(transform)
    return
  }
  
  // Phase 3: WebGL Path (GPU-accelerated)
  if (useWebGL && renderer && wasmMemory) {
    // === DEBUG: Log dirty chunks info ===
    if (DEBUG_DIRTY) {
      debugLogInterval++
      if (debugLogInterval >= DEBUG_LOG_EVERY) {
        debugLogInterval = 0
        
        // Get dirty count BEFORE render (without consuming!)
        const dirtyCount = engine.count_dirty_chunks ? engine.count_dirty_chunks() : 0
        
        // Sample some chunk states
        const chunksX = engine.chunks_x()
        const chunksY = engine.chunks_y()
        const totalChunks = chunksX * chunksY
        
        // Count ALL water and ice particles in the world
        let waterCount = 0
        let iceCount = 0
        let sampleTemp = 0
        let sampleCount = 0
        
        if (memoryManager) {
          const types = memoryManager.types
          const temps = memoryManager.temperature
          const len = types.length
          
          // Scan entire world
          for (let i = 0; i < len; i++) {
            const type = types[i]
            if (type === 6) { // EL_WATER
              waterCount++
              sampleTemp += temps[i]
              sampleCount++
            } else if (type === 5) { // EL_ICE
              iceCount++
              sampleTemp += temps[i]
              sampleCount++
            }
          }
        }
        
        const avgTemp = sampleCount > 0 ? (sampleTemp / sampleCount).toFixed(1) : 'N/A'
        const ambientTemp = engine.get_ambient_temperature ? engine.get_ambient_temperature() : 'N/A'
        
        console.log(`🔍 DEBUG [Frame]: dirty=${dirtyCount}/${totalChunks}, water=${waterCount}, ice=${iceCount}, avgTemp=${avgTemp}°C, ambient=${ambientTemp}°C`)
      }
    }
    
    // Use dirty rectangles for optimal GPU upload
    renderer.renderWithDirtyRects(engine, wasmMemory, transform)
    return
  }
  
  // Fallback: Canvas2D Path (when WebGL not available)
  if (!ctx || !pixels32 || !imageData || !memoryManager) return
  
  // 1. Render to ImageData
  renderNormal()
  
  // 2. Put pixels to context
  ctx.putImageData(imageData, 0, 0)

  // 3. Canvas2D fallback: blit buffer to screen with transform
  renderCanvas2DToScreen(transform)
}

function renderNormal() {
  if (!pixels32 || !memoryManager) return
  
  const typesView = memoryManager.types
  const colorsView = memoryManager.colors
  const len = Math.min(typesView.length, pixels32.length)
  
  // Direct copy (WASM provides ABGR format)
  pixels32.set(colorsView.subarray(0, len))
  
  // Fix empty cells to background
  for (let i = 0; i < len; i++) {
    if (typesView[i] === EL_EMPTY) {
      pixels32[i] = BG_COLOR_32
    }
  }
}

function renderThermal() {
  if (!pixels || !memoryManager) return
  
  const temperatureView = memoryManager.temperature
  const len = Math.min(temperatureView.length, pixels.length / 4)
  
  for (let i = 0; i < len; i++) {
    const temp = temperatureView[i]
    const base = i << 2
    
    const [r, g, b] = getThermalColor(temp)
    
    pixels[base] = r
    pixels[base + 1] = g
    pixels[base + 2] = b
    pixels[base + 3] = 255
  }
}

function getThermalColor(t: number): [number, number, number] {
  if (t < 0) {
    const intensity = Math.min(1, Math.abs(t) / 30)
    return [0, 0, Math.floor(128 + 127 * intensity)]
  }
  if (t < 20) {
    const ratio = t / 20
    return [0, Math.floor(ratio * 255), 255]
  }
  if (t < 50) {
    const ratio = (t - 20) / 30
    return [0, 255, Math.floor(255 * (1 - ratio))]
  }
  if (t < 100) {
    const ratio = (t - 50) / 50
    return [Math.floor(255 * ratio), 255, 0]
  }
  if (t < 500) {
    const ratio = (t - 100) / 400
    return [255, Math.floor(255 * (1 - ratio)), 0]
  }
  const ratio = Math.min(1, (t - 500) / 500)
  return [255, Math.floor(255 * ratio), Math.floor(255 * ratio)]
}

function renderCanvas2DToScreen(transform: { zoom: number; panX: number; panY: number }) {
  if (!canvas || !thermalCanvas || !screenCtx) return

  const viewportW = canvas.width
  const viewportH = canvas.height
  const worldW = thermalCanvas.width
  const worldH = thermalCanvas.height

  if (viewportW <= 0 || viewportH <= 0 || worldW <= 0 || worldH <= 0) return

  const worldAspect = worldW / worldH
  const viewportAspect = viewportW / viewportH
  const scaleToFit = worldAspect > viewportAspect ? viewportW / worldW : viewportH / worldH
  const drawW = worldW * scaleToFit
  const drawH = worldH * scaleToFit
  const offsetX = (viewportW - drawW) / 2
  const offsetY = (viewportH - drawH) / 2

  screenCtx.setTransform(1, 0, 0, 1, 0, 0)
  screenCtx.fillStyle = '#0a0a0a'
  screenCtx.fillRect(0, 0, viewportW, viewportH)

  screenCtx.save()

  const centerX = viewportW / 2
  const centerY = viewportH / 2
  screenCtx.translate(centerX + transform.panX, centerY + transform.panY)
  screenCtx.scale(transform.zoom, transform.zoom)
  screenCtx.translate(-centerX, -centerY)

  screenCtx.drawImage(
    thermalCanvas,
    0,
    0,
    worldW,
    worldH,
    offsetX,
    offsetY,
    drawW,
    drawH
  )

  drawWorldBorder2D(screenCtx, offsetX, offsetY, drawW, drawH, transform.zoom)
  screenCtx.restore()
}

function drawWorldBorder2D(
  target: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number
) {
  const z = zoom || 1

  // Outer glow
  target.strokeStyle = 'rgba(59, 130, 246, 0.3)'
  target.lineWidth = 6 / z
  target.strokeRect(x - 3 / z, y - 3 / z, width + 6 / z, height + 6 / z)

  // Middle glow
  target.strokeStyle = 'rgba(59, 130, 246, 0.5)'
  target.lineWidth = 3 / z
  target.strokeRect(x - 1.5 / z, y - 1.5 / z, width + 3 / z, height + 3 / z)

  // Inner sharp border
  target.strokeStyle = 'rgba(59, 130, 246, 0.8)'
  target.lineWidth = 1 / z
  target.strokeRect(x, y, width, height)

  // Corner accents (bright dots)
  const cornerSize = 8 / z
  target.fillStyle = '#3B82F6'

  // Top-left
  target.fillRect(x - cornerSize / 2, y - cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x - cornerSize / 2, y - cornerSize / 2, 2 / z, cornerSize)

  // Top-right
  target.fillRect(x + width - cornerSize / 2, y - cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x + width - 2 / z + cornerSize / 2, y - cornerSize / 2, 2 / z, cornerSize)

  // Bottom-left
  target.fillRect(x - cornerSize / 2, y + height - 2 / z + cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x - cornerSize / 2, y + height - cornerSize / 2, 2 / z, cornerSize)

  // Bottom-right
  target.fillRect(x + width - cornerSize / 2, y + height - 2 / z + cornerSize / 2, cornerSize, 2 / z)
  target.fillRect(x + width - 2 / z + cornerSize / 2, y + height - cornerSize / 2, 2 / z, cornerSize)
}

// ============================================================================
// INPUT HANDLING
// ============================================================================

function handleInput(
  x: number,
  y: number,
  radius: number,
  element: ElementType,
  tool: ToolType,
  brushShape: 'circle' | 'square' | 'line' = 'circle'
) {
  if (!engine) return
  
  // Apply camera transform to convert screen coords to world coords
  // CRITICAL: Use viewport for screen position, world size for final coords
  const viewport = { width: viewportWidth, height: viewportHeight }
  const worldSize = { width: engine.width, height: engine.height }
  const world = invertTransform(
    x,
    y,
    { zoom, panX, panY },
    viewport,
    worldSize  // Pass world size for proper scaling when world != viewport
  )
  const worldX = Math.floor(world.x)
  const worldY = Math.floor(world.y)
  
  const wasmElement = ELEMENT_MAP[element] ?? 0
  
  const applyBrush = (wx: number, wy: number) => {
    if (tool === 'eraser') {
      engine.remove_particles_in_radius(wx, wy, radius)
    } else if (tool === 'brush') {
      if (wasmElement !== 0) {
        engine.add_particles_in_radius(wx, wy, radius, wasmElement)
      }
    }
  }

  if (brushShape === 'square') {
    const half = Math.max(1, radius)
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        applyBrush(worldX + dx, worldY + dy)
      }
    }
  } else if (brushShape === 'line') {
    drawLine(worldX - radius, worldY, worldX + radius, worldY, radius, wasmElement, tool === 'eraser')
  } else {
    applyBrush(worldX, worldY)
  }
  // pipette and move are handled on main thread (UI concerns)
}

// Phase 5: State for Bresenham line interpolation
let lastInputX: number | null = null
let lastInputY: number | null = null
const FILL_LIMIT = 200_000 // safety guard to prevent freezes

/**
 * Bresenham's Line Algorithm for smooth drawing
 * Draws a line of particles between (x0, y0) and (x1, y1)
 */
function drawLine(x0: number, y0: number, x1: number, y1: number, radius: number, elementType: number, isErase: boolean) {
  if (!engine) return
  
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = (x0 < x1) ? 1 : -1
  const sy = (y0 < y1) ? 1 : -1
  let err = dx - dy

  while (true) {
    // Apply brush at current point
    if (isErase) {
      engine.remove_particles_in_radius(x0, y0, radius)
    } else {
      engine.add_particles_in_radius(x0, y0, radius, elementType)
    }

    if (x0 === x1 && y0 === y1) break
    
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x0 += sx }
    if (e2 < dx) { err += dx; y0 += sy }
  }
}

/**
 * Phase 5: Process all pending input from shared buffer
 * Called every frame before physics step
 * Uses Bresenham interpolation for smooth lines!
 * 
 * Phase 3 (Fort Knox): Handles overflow - resets Bresenham to prevent artifacts
 */
function processSharedInput() {
  if (!sharedInputBuffer || !engine) return
  
  // Phase 3 (Fort Knox): Check for buffer overflow
  // If overflow occurred, reset Bresenham state to prevent line artifacts
  // (e.g., line drawn from last known point to current point across the screen)
  if (sharedInputBuffer.checkAndClearOverflow()) {
    console.warn('🔒 Input buffer overflow detected - resetting Bresenham state')
    lastInputX = null
    lastInputY = null
  }
  
  // Read all events accumulated since last frame (zero-allocation!)
  sharedInputBuffer.processAll((x, y, type, val) => {
    // CRITICAL: Handle end-stroke sentinel FIRST - resets Bresenham state
    // This goes through the same SAB channel as brush events, so no race conditions!
    if (type === INPUT_TYPE_END_STROKE) {
      lastInputX = null
      lastInputY = null
      return
    }
    
    const currentX = Math.floor(x)
    const currentY = Math.floor(y)
    
    const isErase = (type === INPUT_TYPE_ERASE)
    const elementType = isErase ? 0 : (type - INPUT_TYPE_BRUSH_OFFSET)

    // Guard against malformed element ids
    if (!isErase && elementType <= 0) {
      return
    }

    // If this is a new stroke or we lost tracking, start here
    if (lastInputX === null || lastInputY === null) {
      lastInputX = currentX
      lastInputY = currentY
      // Draw single point
      if (isErase) {
        engine.remove_particles_in_radius(currentX, currentY, val)
      } else if (elementType !== 0) {
        engine.add_particles_in_radius(currentX, currentY, val, elementType)
      }
      return
    }

    // Interpolate line from last known position to current
    if (elementType !== 0 || isErase) {
      drawLine(lastInputX, lastInputY, currentX, currentY, val, elementType, isErase)
    }

    // Update tracking
    lastInputX = currentX
    lastInputY = currentY
  })
}

/**
 * Reset input tracking (called on mouse up)
 */
function resetInputTracking() {
  lastInputX = null
  lastInputY = null
}

function captureSnapshot(): ArrayBuffer | null {
  // Guard against calls after crash
  if (isCrashed || !memoryManager || !engine) return null
  
  try {
    // Check if memory is valid before accessing
    if (!memoryManager.isValid) {
      console.warn('⚠️ captureSnapshot: Memory not valid, skipping')
      return null
    }
    const types = memoryManager.types
    // Copy into new ArrayBuffer to transfer
    return new Uint8Array(types).buffer
  } catch (e) {
    console.error('captureSnapshot failed:', e)
    return null
  }
}

function loadSnapshotBuffer(buffer: ArrayBuffer) {
  if (!engine || !wasmModule) return
  const types = new Uint8Array(buffer)
  const width = engine.width as number
  const height = engine.height as number
  const expected = width * height
  if (types.length !== expected) {
    console.warn('Snapshot size mismatch, skipping load')
    return
  }
  // Reset world
  engine = new wasmModule.World(width, height)
  applyCurrentSettingsToEngine()
  lastInputX = null
  lastInputY = null
  updateMemoryViews()
  // Re-apply particles
  for (let i = 0; i < types.length; i++) {
    const elId = types[i]
    if (elId === 0) continue
    const x = i % width
    const y = Math.floor(i / width)
    engine.add_particle(x, y, elId)
  }
  // Force full upload on renderer next frame
  if (renderer) renderer.requestFullUpload()
}

/**
 * Read element at world coordinate
 */
function readElementAt(x: number, y: number): ElementType | null {
  if (!memoryManager || !engine) return null
  const width = engine.width as number
  const height = engine.height as number
  if (x < 0 || y < 0 || x >= width || y >= height) return null
  const types = memoryManager.types
  const idx = y * width + x
  const elId = types[idx] ?? 0
  return ELEMENT_ID_TO_NAME[elId] ?? null
}

/**
 * Flood fill contiguous area of the same element id
 */
function floodFill(startX: number, startY: number, targetElementId: number) {
  if (!memoryManager || !engine) return
  const width = engine.width as number
  const height = engine.height as number
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return

  const types = memoryManager.types
  const startIdx = startY * width + startX
  const sourceId = types[startIdx] ?? 0

  // nothing to do
  if (sourceId === targetElementId) return

  const len = width * height
  if (!fillVisited || fillVisited.length !== len) {
    fillVisited = new Int32Array(len)
    fillStamp = 1
  } else {
    fillStamp++
    if (fillStamp >= 0x7fffffff) {
      fillVisited.fill(0)
      fillStamp = 1
    }
  }

  const stamp = fillStamp
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
  let processed = 0

  while (stack.length > 0) {
    const { x, y } = stack.pop() as { x: number; y: number }
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const idx = y * width + x
    if (fillVisited[idx] === stamp) continue
    if (types[idx] !== sourceId) continue

    fillVisited[idx] = stamp
    processed++
    if (processed > FILL_LIMIT) break

    // Replace
    if (targetElementId === 0) {
      engine.remove_particle(x, y)
    } else {
      // If there is something else, remove then add to ensure overwrite
      engine.remove_particle(x, y)
      engine.add_particle(x, y, targetElementId)
    }

    stack.push({ x: x + 1, y })
    stack.push({ x: x - 1, y })
    stack.push({ x, y: y + 1 })
    stack.push({ x, y: y - 1 })
  }
}

// ============================================================================
// STATS
// ============================================================================

function sendStats() {
  // Calculate average FPS (zero allocation)
  let sum = 0
  for (let i = 0; i < fpsCount; i++) {
    sum += fpsBuffer[i]
  }
  const avgFps = fpsCount > 0 ? sum / fpsCount : 0
  
  const particleCount = engine?.particle_count ?? 0
  
  self.postMessage({
    type: 'STATS',
    fps: Math.round(avgFps),
    particleCount
  })
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data
  
  switch (msg.type) {
    case 'INIT':
      initEngine(msg.canvas, msg.width, msg.height, msg.viewportWidth, msg.viewportHeight, msg.inputBuffer)
      break
      
    case 'PLAY':
      isPlaying = true
      break
      
    case 'PAUSE':
      isPlaying = false
      break
      
    case 'STEP':
      if (engine) {
        engine.step()
        updateMemoryViews()
      }
      break
    
    case 'FILL': {
      if (!engine || !memoryManager) break
      const elementId = ELEMENT_MAP[msg.element] ?? 0
      floodFill(msg.x, msg.y, elementId)
      break
    }
    
    case 'SPAWN_RIGID_BODY': {
      if (!engine) break
      const elementId = ELEMENT_MAP[msg.element] ?? 1 // Default to stone
      if (msg.shape === 'circle') {
        engine.spawn_rigid_circle(msg.x, msg.y, Math.floor(msg.size / 2), elementId)
      } else {
        engine.spawn_rigid_body(msg.x, msg.y, msg.size, msg.size, elementId)
      }
      break
    }
    
    case 'PIPETTE': {
      const viewport = { width: viewportWidth, height: viewportHeight }
      const worldSize = engine ? { width: engine.width, height: engine.height } : { width: 0, height: 0 }
      const world = invertTransform(
        msg.x,
        msg.y,
        { zoom, panX, panY },
        viewport,
        worldSize
      )
      const worldX = Math.floor(world.x)
      const worldY = Math.floor(world.y)
      const element = readElementAt(worldX, worldY)
      self.postMessage({ type: 'PIPETTE_RESULT', id: msg.id, element })
      break
    }
    
    case 'SNAPSHOT': {
      const buffer = captureSnapshot()
      if (buffer) {
        self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer }, { transfer: [buffer] })
      } else {
        self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer: null })
      }
      break
    }
    
    case 'LOAD_SNAPSHOT': {
      loadSnapshotBuffer(msg.buffer)
      break
    }
      
    case 'INPUT':
      handleInput(msg.x, msg.y, msg.radius, msg.element, msg.tool, msg.brushShape ?? 'circle')
      break
      
    case 'INPUT_END':
      // Phase 5: Reset Bresenham line tracking on mouse up
      resetInputTracking()
      break
      
    case 'TRANSFORM':
      zoom = msg.zoom
      panX = msg.panX
      panY = msg.panY
      break
      
	    case 'SETTINGS':
	      if (msg.gravity) {
	        currentGravity = msg.gravity
	      }
	      if (msg.ambientTemperature !== undefined) {
	        currentAmbientTemperature = msg.ambientTemperature
	      }
	      if (msg.speed !== undefined) {
	        speed = msg.speed
	      }
	      applyCurrentSettingsToEngine()
	      break
      
    case 'SET_RENDER_MODE':
      renderMode = msg.mode
      // Force full texture upload when returning to normal mode
      if (renderMode === 'normal' && useWebGL && renderer) {
        renderer.requestFullUpload()
      }
      break
      
    case 'CLEAR':
      if (engine) {
        engine.clear()
      }
      break
      
	    case 'RESIZE': {
	      if (!engine || !wasmModule) break

	      // CRITICAL: Force integer sizes to prevent "falling through" bug
	      const w = Math.max(1, Math.floor(msg.width))
	      const h = Math.max(1, Math.floor(msg.height))

	      const currentW = engine.width as number
	      const currentH = engine.height as number
	      if (w === currentW && h === currentH) break

	      // Recreate world with new size (viewport stays unchanged!)
	      engine = new wasmModule.World(w, h)
	      applyCurrentSettingsToEngine()
	      lastInputX = null
	      lastInputY = null

	      // Resize thermal buffer (used by thermal mode + Canvas2D fallback)
	      thermalCanvas = new OffscreenCanvas(w, h)
	      ctx = thermalCanvas.getContext('2d', {
	        alpha: false,
	        desynchronized: true
	      }) as OffscreenCanvasRenderingContext2D | null
	      if (ctx) {
	        ctx.imageSmoothingEnabled = false
	        imageData = new ImageData(w, h)
	        pixels = imageData.data
	        pixels32 = new Uint32Array(pixels.buffer)
	      }

	      // Resize WebGL renderer world resources (if active)
	      if (useWebGL && renderer) {
	        renderer.resizeWorld(w, h)
	      }

	      // Reset fill cache (size changed)
	      fillVisited = null

	      updateMemoryViews()
	      console.log(`⚡ Resized World to: ${w}x${h}`)
	      break
	    }

	    case 'SET_VIEWPORT': {
	      if (!canvas) break

	      const w = Math.max(1, Math.floor(msg.width))
	      const h = Math.max(1, Math.floor(msg.height))
	      if (w === viewportWidth && h === viewportHeight) break

	      viewportWidth = w
	      viewportHeight = h

	      canvas.width = w
	      canvas.height = h

	      if (useWebGL && renderer) {
	        renderer.setViewportSize(w, h)
	      } else if (screenCtx) {
	        // Resizing resets context state
	        screenCtx.imageSmoothingEnabled = false
	      }

	      break
	    }
	  }
}

// Export empty to make it a module
export {}
