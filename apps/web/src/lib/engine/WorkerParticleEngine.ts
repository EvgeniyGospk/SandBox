/**
 * WorkerParticleEngine - Multi-threaded particle simulation
 * 
 * Phase 2: Simulation runs in Web Worker
 * 
 * Main Thread: Rendering + UI
 * Worker Thread: Physics simulation
 * Communication: SharedArrayBuffer (zero-copy!)
 */

import { SharedGrid, isSharedArrayBufferAvailable } from './core/SharedGrid'
import { CanvasRenderer, RenderMode } from './Renderer'
import { ElementType, WorldSettings } from './types'
import type { WorkerMessage, WorkerResponse } from './workers'

// Import worker using Vite's ?worker syntax
import SimulationWorker from './workers/simulation.worker?worker'

export class WorkerParticleEngine {
  private grid: SharedGrid
  private worker: Worker
  private renderer: CanvasRenderer | null = null
  
  private _width: number
  private _height: number
  private _particleCount: number = 0
  private _frame: number = 0
  private _isReady: boolean = false
  private _isRunning: boolean = false
  
  // Callbacks
  private onReadyCallback: (() => void) | null = null
  private onStepCallback: ((frame: number, particleCount: number) => void) | null = null
  
  constructor(width: number, height: number) {
    if (!isSharedArrayBufferAvailable()) {
      throw new Error('SharedArrayBuffer is not available. Check Cross-Origin Isolation headers.')
    }
    
    this._width = width
    this._height = height
    
    // Create shared grid
    this.grid = new SharedGrid(width, height)
    
    // Create worker
    this.worker = new SimulationWorker()
    this.worker.onmessage = this.handleWorkerMessage.bind(this)
    this.worker.onerror = this.handleWorkerError.bind(this)
    
    // Initialize worker with shared buffers
    this.sendMessage({ type: 'init', buffers: this.grid.getBuffers() })
  }
  
  private sendMessage(msg: WorkerMessage) {
    this.worker.postMessage(msg)
  }
  
  private handleWorkerMessage(e: MessageEvent<WorkerResponse>) {
    const msg = e.data
    
    switch (msg.type) {
      case 'ready':
        this._isReady = true
        this.onReadyCallback?.()
        break
        
      case 'stepped':
        this._frame = msg.frame
        this._particleCount = msg.particleCount
        this.onStepCallback?.(msg.frame, msg.particleCount)
        break
        
      case 'stats':
        this._frame = msg.frame
        this._particleCount = msg.particleCount
        break
        
      case 'error':
        console.error('Worker error:', msg.message)
        break
    }
  }
  
  private handleWorkerError(e: ErrorEvent) {
    console.error('Worker error:', e.message)
  }
  
  // === Public API ===
  
  get width(): number { return this._width }
  get height(): number { return this._height }
  get particleCount(): number { return this._particleCount }
  get frame(): number { return this._frame }
  get isReady(): boolean { return this._isReady }
  get isRunning(): boolean { return this._isRunning }
  
  /**
   * Set callback for when worker is ready
   */
  onReady(callback: () => void) {
    this.onReadyCallback = callback
    if (this._isReady) callback()
  }
  
  /**
   * Set callback for each simulation step
   */
  onStep(callback: (frame: number, particleCount: number) => void) {
    this.onStepCallback = callback
  }
  
  /**
   * Attach renderer to canvas
   */
  attachRenderer(ctx: CanvasRenderingContext2D): void {
    this.renderer = new CanvasRenderer(ctx, this._width, this._height)
  }
  
  /**
   * Start continuous simulation
   */
  start(): void {
    if (!this._isReady) return
    this._isRunning = true
    this.sendMessage({ type: 'start' })
  }
  
  /**
   * Stop continuous simulation
   */
  stop(): void {
    this._isRunning = false
    this.sendMessage({ type: 'stop' })
  }
  
  /**
   * Run single simulation step
   */
  step(): void {
    if (!this._isReady) return
    this.sendMessage({ type: 'step' })
  }
  
  /**
   * Update world settings
   */
  setSettings(settings: Partial<WorldSettings>): void {
    this.sendMessage({ type: 'setSettings', settings })
  }
  
  /**
   * Add particle at position
   */
  addParticle(x: number, y: number, element: ElementType): void {
    this.sendMessage({ type: 'addParticle', x, y, element })
  }
  
  /**
   * Add particles in radius
   */
  addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType): void {
    this.sendMessage({ type: 'addParticlesInRadius', cx, cy, radius, element })
  }
  
  /**
   * Remove particle at position
   */
  removeParticle(x: number, y: number): void {
    this.sendMessage({ type: 'removeParticle', x, y })
  }
  
  /**
   * Remove particles in radius
   */
  removeParticlesInRadius(cx: number, cy: number, radius: number): void {
    this.sendMessage({ type: 'removeParticlesInRadius', cx, cy, radius })
  }
  
  /**
   * Clear all particles
   */
  clear(): void {
    this.sendMessage({ type: 'clear' })
    this._particleCount = 0
    this._frame = 0
  }
  
  /**
   * Render current state
   * Reads directly from SharedArrayBuffer - no copying!
   */
  render(): void {
    if (!this.renderer) return
    
    this.renderer.render(
      this.grid.types,
      this.grid.colors,
      this.grid.temperature
    )
  }
  
  /**
   * Set render mode
   */
  setRenderMode(mode: RenderMode): void {
    this.renderer?.setMode(mode)
  }
  
  /**
   * Get render mode
   */
  getRenderMode(): RenderMode {
    return this.renderer?.getMode() ?? 'normal'
  }
  
  /**
   * Set camera transform
   */
  setTransform(zoom: number, panX: number, panY: number): void {
    this.renderer?.setTransform(zoom, panX, panY)
  }
  
  /**
   * Resize simulation
   */
  resize(width: number, height: number): void {
    // Note: resize requires recreating the worker with new buffers
    // For now, this is a simple implementation
    this._width = width
    this._height = height
    this.grid.resize(width, height)
    this.renderer?.resize(width, height)
    
    // Reinitialize worker with new buffers
    this.sendMessage({ type: 'init', buffers: this.grid.getBuffers() })
  }
  
  /**
   * Terminate worker and cleanup
   */
  destroy(): void {
    this.worker.terminate()
  }
}
