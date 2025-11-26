/**
 * WorkerBridge - Main thread interface to simulation worker
 * 
 * Phase 5: Uses SharedArrayBuffer Ring Buffer for zero-latency input!
 * 
 * Provides the same API as WasmParticleEngine but delegates to worker.
 * Main thread never touches WASM directly.
 */

import type { ElementType, RenderMode, ToolType } from './types'
import { screenToWorld as invertTransform } from './transform'
import { 
  SharedInputBuffer, 
  getInputBufferSize, 
  isSharedArrayBufferAvailable
} from '../InputBuffer'

// Create worker with Vite's ?worker import
import SimulationWorker from '@/workers/simulation.worker.ts?worker'

export interface SimulationStats {
  fps: number
  particleCount: number
}

export type StatsCallback = (stats: SimulationStats) => void
export type ReadyCallback = (width: number, height: number) => void
export type ErrorCallback = (message: string) => void

/**
 * Bridge between Main Thread and Simulation Worker
 * 
 * Usage:
 * ```ts
 * const bridge = new WorkerBridge()
 * bridge.onStats = (stats) => setFps(stats.fps)
 * await bridge.init(canvas, width, height)
 * bridge.play()
 * bridge.addParticles(x, y, radius, element)
 * ```
 */
// Element name to ID mapping (must match Rust elements.rs)
const ELEMENT_TO_ID: Record<ElementType, number> = {
  'empty': 0, 'stone': 1, 'sand': 2, 'wood': 3, 'metal': 4, 'ice': 5,
  'water': 6, 'oil': 7, 'lava': 8, 'acid': 9, 'steam': 10, 'smoke': 11,
  'fire': 12, 'spark': 13, 'electricity': 14, 'gunpowder': 15,
  'clone': 16, 'void': 17, 'dirt': 18, 'seed': 19, 'plant': 20
}

export class WorkerBridge {
  private worker: Worker | null = null
  private _width: number = 0
  private _height: number = 0
  private _isReady: boolean = false
  
  // Phase 5: Shared input buffer for zero-latency input
  private inputBuffer: SharedInputBuffer | null = null
  private useSharedInput: boolean = false
  
  // Callbacks
  public onStats: StatsCallback | null = null
  public onReady: ReadyCallback | null = null
  public onError: ErrorCallback | null = null
  
  // Camera state (stored on main thread for coordinate conversion)
  private zoom: number = 1
  private panX: number = 0
  private panY: number = 0
  
  constructor() {
    // Worker will be created on init
  }
  
  /**
   * Initialize the simulation worker with an OffscreenCanvas
   */
  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create worker
        this.worker = new SimulationWorker()
        this._width = width
        this._height = height
        
        // Setup message handler
        this.worker.onmessage = (e) => {
          const msg = e.data
          
          switch (msg.type) {
            case 'READY':
              this._isReady = true
              this._width = msg.width
              this._height = msg.height
              this.onReady?.(msg.width, msg.height)
              resolve()
              break
              
            case 'STATS':
              this.onStats?.({
                fps: msg.fps,
                particleCount: msg.particleCount
              })
              break
              
            case 'ERROR':
              this.onError?.(msg.message)
              reject(new Error(msg.message))
              break
          }
        }
        
        this.worker.onerror = (e) => {
          this.onError?.(e.message)
          reject(e)
        }
        
        // Transfer canvas control to worker
        const offscreen = canvas.transferControlToOffscreen()
        
        // Phase 5: Create shared input buffer if available
        let inputBufferData: SharedArrayBuffer | null = null
        if (isSharedArrayBufferAvailable()) {
          try {
            inputBufferData = new SharedArrayBuffer(getInputBufferSize())
            this.inputBuffer = new SharedInputBuffer(inputBufferData)
            this.useSharedInput = true
            console.log('🚀 WorkerBridge: Using SharedArrayBuffer for input (zero-latency)')
          } catch (e) {
            console.warn('SharedArrayBuffer not available, falling back to postMessage')
          }
        }
        
        // Send init message with canvas and optional input buffer
        this.worker.postMessage(
          {
            type: 'INIT',
            canvas: offscreen,
            width,
            height,
            inputBuffer: inputBufferData // May be null
          },
          [offscreen] // Transfer list (SAB is not transferred, just shared)
        )
        
      } catch (error) {
        reject(error)
      }
    })
  }
  
  // === Getters ===
  
  get width(): number { return this._width }
  get height(): number { return this._height }
  get isReady(): boolean { return this._isReady }
  
  // === Playback Control ===
  
  play(): void {
    this.worker?.postMessage({ type: 'PLAY' })
  }
  
  pause(): void {
    this.worker?.postMessage({ type: 'PAUSE' })
  }
  
  clear(): void {
    this.worker?.postMessage({ type: 'CLEAR' })
  }
  
  // === Input ===
  
  /**
   * Add/remove particles (screen coordinates are converted to world)
   * Phase 5: Uses SharedArrayBuffer when available for zero-latency!
   */
  handleInput(screenX: number, screenY: number, radius: number, element: ElementType, tool: ToolType): void {
    const viewport = { width: this._width, height: this._height }
    const world = invertTransform(
      screenX,
      screenY,
      { zoom: this.zoom, panX: this.panX, panY: this.panY },
      viewport
    )
    const worldX = Math.floor(world.x)
    const worldY = Math.floor(world.y)
    
    // Phase 5: Use shared buffer for instant input (no postMessage delay!)
    if (this.useSharedInput && this.inputBuffer) {
      if (tool === 'eraser') {
        this.inputBuffer.pushErase(worldX, worldY, radius)
      } else if (tool === 'brush') {
        const elementId = ELEMENT_TO_ID[element] ?? 0
        if (elementId !== 0) { // Don't push empty
          this.inputBuffer.pushBrush(worldX, worldY, radius, elementId)
        }
      }
      return
    }
    
    // Fallback: postMessage (slower but always works)
    this.worker?.postMessage({
      type: 'INPUT',
      x: screenX,
      y: screenY,
      radius,
      element,
      tool
    })
  }
  
  /**
   * Shorthand for brush tool
   */
  addParticles(screenX: number, screenY: number, radius: number, element: ElementType): void {
    this.handleInput(screenX, screenY, radius, element, 'brush')
  }
  
  /**
   * Shorthand for eraser tool
   */
  removeParticles(screenX: number, screenY: number, radius: number): void {
    this.handleInput(screenX, screenY, radius, 'empty', 'eraser')
  }
  
  /**
   * Signal end of stroke (mouseUp) - resets Bresenham interpolation
   * CRITICAL: Must be called on mouseUp to prevent lines between strokes!
   * Uses SAB sentinel when available to prevent race conditions!
   */
  endStroke(): void {
    // Use SAB channel for end stroke (same channel as brush events = no race condition!)
    if (this.useSharedInput && this.inputBuffer) {
      this.inputBuffer.pushEndStroke()
      return
    }
    // Fallback: postMessage
    this.worker?.postMessage({ type: 'INPUT_END' })
  }
  
  // === Camera ===
  
  setTransform(zoom: number, panX: number, panY: number): void {
    this.zoom = zoom
    this.panX = panX
    this.panY = panY
    
    this.worker?.postMessage({
      type: 'TRANSFORM',
      zoom,
      panX,
      panY
    })
  }
  
  getTransform(): { zoom: number; panX: number; panY: number } {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY }
  }
  
  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const viewport = { width: this._width, height: this._height }
    const world = invertTransform(
      screenX,
      screenY,
      { zoom: this.zoom, panX: this.panX, panY: this.panY },
      viewport
    )
    return {
      x: Math.floor(world.x),
      y: Math.floor(world.y)
    }
  }
  
  // === Settings ===
  
  setSettings(settings: {
    gravity?: { x: number; y: number }
    ambientTemperature?: number
    speed?: number
  }): void {
    this.worker?.postMessage({
      type: 'SETTINGS',
      ...settings
    })
  }
  
  setRenderMode(mode: RenderMode): void {
    this.worker?.postMessage({
      type: 'SET_RENDER_MODE',
      mode
    })
  }
  
  // === Lifecycle ===
  
  resize(width: number, height: number): void {
    this._width = width
    this._height = height
    
    this.worker?.postMessage({
      type: 'RESIZE',
      width,
      height
    })
  }
  
  destroy(): void {
    this.worker?.terminate()
    this.worker = null
    this._isReady = false
  }
}

/**
 * Check if WebWorkers with OffscreenCanvas are supported
 */
export function isWorkerSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    // Check if we can transfer canvas control
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  )
}

/**
 * Check if SharedArrayBuffer is available (COOP/COEP headers set)
 */
export function isSharedMemorySupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}
