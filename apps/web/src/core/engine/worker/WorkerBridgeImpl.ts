/**
 * WorkerBridge - Main thread interface to simulation worker
 * 
 * Phase 5: Uses SharedArrayBuffer Ring Buffer for zero-latency input!
 * 
 * Provides the same API as WasmParticleEngine but delegates to worker.
 * Main thread never touches WASM directly.
 */

import type { ElementType, RenderMode, ToolType } from '../types'
import { debugWarn, logError } from '../../logging/log'
import { parseWorkerToMainMessage, SIMULATION_PROTOCOL_VERSION } from '../protocol'
import type { SharedInputBuffer } from '../../canvas/input/InputBuffer'

import {
  createRequestState,
  handlePipetteResult,
  handleSnapshotResult,
  installWorkerHandlers,
  postClear,
  postEndStroke,
  postInit,
  postLoadSnapshot,
  postPause,
  postPlay,
  postResize,
  postRenderMode,
  postSettings,
  postSetViewport,
  postSpawnRigidBody,
  postStep,
  postTransform,
  requestPipette,
  requestSnapshot,
  resolveAllPendingRequests,
  screenToWorldFloored,
  sendFillToWorker,
  sendInputToWorker,
  setupSharedInputBuffer,
  terminateWorker,
  transferCanvasToOffscreen,
} from './bridge'

// Create worker with Vite's ?worker import
import SimulationWorker from '@/workers/simulation/runtime.ts?worker'

export interface SimulationStats {
  fps: number
  particleCount: number
}

export type StatsCallback = (stats: { fps: number; particleCount: number }) => void
export type ReadyCallback = (width: number, height: number) => void
export type ErrorCallback = (message: string) => void
export type CrashCallback = (message: string, canRecover: boolean) => void

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
export class WorkerBridge {
  private worker: Worker | null = null
  private _width: number = 0       // World size
  private _height: number = 0      // World size
  private _viewportWidth: number = 0   // Viewport size (for coordinate conversion)
  private _viewportHeight: number = 0  // Viewport size
  private _isReady: boolean = false
  private _hasTransferred: boolean = false
  
  // Phase 5: Shared input buffer for zero-latency input
  private inputBuffer: SharedInputBuffer | null = null
  private useSharedInput: boolean = false
  private requests = createRequestState()
  
  // Callbacks
  public onStats: StatsCallback | null = null
  public onReady: ReadyCallback | null = null
  public onError: ErrorCallback | null = null
  public onCrash: CrashCallback | null = null  // Phase 5: Crash recovery
  
  // Camera state (stored on main thread for coordinate conversion)
  private zoom: number = 1
  private panX: number = 0
  private panY: number = 0
  
  constructor() {
    // Worker will be created on init
  }

  private resolveAllPendingRequests(): void {
    resolveAllPendingRequests(this.requests)
  }
  
  /**
   * Initialize the simulation worker with an OffscreenCanvas
   * @param canvas - The canvas element (will be transferred to worker)
   * @param worldWidth - World simulation width
   * @param worldHeight - World simulation height  
   * @param viewportWidth - Optional viewport width (defaults to canvas.width)
   * @param viewportHeight - Optional viewport height (defaults to canvas.height)
   */
  async init(
    canvas: HTMLCanvasElement, 
    worldWidth: number, 
    worldHeight: number,
    viewportWidth?: number,
    viewportHeight?: number
  ): Promise<void> {
    // Clean previous state (if any)
    this.destroy()
    this._isReady = false
    this._hasTransferred = false
    this.useSharedInput = false
    this.inputBuffer = null

    // Create worker
    const worker = new SimulationWorker()
    this.worker = worker
    this._width = Math.floor(worldWidth)
    this._height = Math.floor(worldHeight)
    // Store viewport size for coordinate conversion (before canvas is transferred!)
    this._viewportWidth = Math.floor(viewportWidth ?? canvas.width)
    this._viewportHeight = Math.floor(viewportHeight ?? canvas.height)

    let resolveInit: (() => void) | null = null
    let rejectInit: ((err: Error) => void) | null = null
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveInit = resolve
      rejectInit = reject
    })

    const rejectInitIfPending = (err: Error) => {
      if (!rejectInit) return
      rejectInit(err)
      resolveInit = null
      rejectInit = null
    }

    const resolveInitOnce = () => {
      resolveInit?.()
      resolveInit = null
      rejectInit = null
    }

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: SIMULATION_PROTOCOL_VERSION,
      parseMessage: parseWorkerToMainMessage,
      onUnknownMessage: (data) => {
        debugWarn('WorkerBridge: Ignoring unknown worker message', data)
      },
      onReady: (width, height) => {
        this._isReady = true
        this._width = width
        this._height = height
        this.onReady?.(width, height)
      },
      onStats: (fps, particleCount) => {
        this.onStats?.({ fps, particleCount })
      },
      onError: (message) => {
        this.onError?.(message)
      },
      onCrash: (message, canRecover) => {
        logError('💥 WASM Crash:', message)
        this.onCrash?.(message, canRecover ?? true)
      },
      onPipetteResult: (id, element) => {
        handlePipetteResult(this.requests, id, element)
      },
      onSnapshotResult: (id, buffer) => {
        handleSnapshotResult(this.requests, id, buffer)
      },
      resolveAllPendingRequests: () => this.resolveAllPendingRequests(),
      destroy: () => this.destroy(),
      resolveInit: resolveInitOnce,
      rejectInit: (err) => rejectInitIfPending(err),
      rejectInitIfPending,
    })

    // Transfer canvas control to worker (may throw)
    let offscreen: OffscreenCanvas
    try {
      offscreen = transferCanvasToOffscreen(canvas)
      this._hasTransferred = true
    } catch (err) {
      terminateWorker(worker)
      if (this.worker === worker) this.worker = null
      this._hasTransferred = false
      throw err
    }

    // Phase 5: Create shared input buffer if available
    const { inputBufferData, inputBuffer, useSharedInput } = setupSharedInputBuffer()
    this.inputBuffer = inputBuffer
    this.useSharedInput = useSharedInput

    // Send init message with canvas and optional input buffer
    postInit(worker, {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      canvas: offscreen,
      width: this._width,
      height: this._height,
      viewportWidth: this._viewportWidth,
      viewportHeight: this._viewportHeight,
      inputBuffer: inputBufferData,
    })

    await readyPromise
  }
  
  // === Getters ===
  
  get width(): number { return this._width }
  get height(): number { return this._height }
  get isReady(): boolean { return this._isReady }
  get hasTransferred(): boolean { return this._hasTransferred }
  
  // === Playback Control ===
  
  play(): void {
    postPlay(this.worker)
  }

  pause(): void {
    postPause(this.worker)
  }

  step(): void {
    postStep(this.worker)
  }
  
  clear(): void {
    postClear(this.worker)
  }
  
  // === Input ===
  
  /**
   * Add/remove particles (screen coordinates are converted to world)
   * Phase 5: Uses SharedArrayBuffer when available for zero-latency!
   */
  handleInput(
    screenX: number,
    screenY: number,
    radius: number,
    element: ElementType,
    tool: ToolType,
    brushShape: 'circle' | 'square' | 'line' = 'circle'
  ): void {
    const { x: worldX, y: worldY } = screenToWorldFloored(
      screenX,
      screenY,
      this.zoom,
      this.panX,
      this.panY,
      this._viewportWidth,
      this._viewportHeight,
      this._width,
      this._height
    )
    
    sendInputToWorker({
      worker: this.worker,
      useSharedInput: this.useSharedInput,
      inputBuffer: this.inputBuffer,
      tool,
      element,
      radius,
      brushShape,
      screenX,
      screenY,
      worldX,
      worldY,
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
   * Flood fill tool (worker only)
   */
  fill(screenX: number, screenY: number, element: ElementType): void {
    const { x: worldX, y: worldY } = screenToWorldFloored(
      screenX,
      screenY,
      this.zoom,
      this.panX,
      this.panY,
      this._viewportWidth,
      this._viewportHeight,
      this._width,
      this._height
    )
    sendFillToWorker({ worker: this.worker, worldX, worldY, element })
  }
  
  /**
   * Spawn a rigid body at world coordinates
   */
  spawnRigidBody(
    worldX: number, 
    worldY: number, 
    size: number, 
    shape: 'box' | 'circle', 
    element: ElementType
  ): void {
    postSpawnRigidBody(this.worker, {
      x: Math.floor(worldX),
      y: Math.floor(worldY),
      size: Math.floor(size),
      shape,
      element,
    })
  }

  /**
   * Pipette tool - returns element under cursor
   */
  pipette(screenX: number, screenY: number): Promise<ElementType | null> {
    if (!this.worker) return Promise.resolve(null)
    return requestPipette(this.requests, this.worker, screenX, screenY)
  }

  /**
   * Capture snapshot of world (types only)
   */
  saveSnapshot(): Promise<ArrayBuffer | null> {
    if (!this.worker) return Promise.resolve(null)
    return requestSnapshot(this.requests, this.worker)
  }

  /**
   * Load snapshot buffer (must match world dimensions)
   */
  loadSnapshot(buffer: ArrayBuffer): void {
    postLoadSnapshot(this.worker, buffer)
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
    postEndStroke(this.worker)
  }
  
  // === Camera ===
  
  setTransform(zoom: number, panX: number, panY: number): void {
    this.zoom = zoom
    this.panX = panX
    this.panY = panY

    postTransform(this.worker, zoom, panX, panY)
  }
  
  getTransform(): { zoom: number; panX: number; panY: number } {
    return { zoom: this.zoom, panX: this.panX, panY: this.panY }
  }
  
  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return screenToWorldFloored(
      screenX,
      screenY,
      this.zoom,
      this.panX,
      this.panY,
      this._viewportWidth,
      this._viewportHeight,
      this._width,
      this._height
    )
  }
  
  // === Settings ===
  
  setSettings(settings: {
    gravity?: { x: number; y: number }
    ambientTemperature?: number
    speed?: number
  }): void {
    postSettings(this.worker, settings)
  }
  
  setRenderMode(mode: RenderMode): void {
    postRenderMode(this.worker, mode)
  }
  
  // === Lifecycle ===

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = Math.floor(width)
    this._viewportHeight = Math.floor(height)
    postSetViewport(this.worker, this._viewportWidth, this._viewportHeight)
  }

  resize(width: number, height: number): void {
    this._width = Math.floor(width)
    this._height = Math.floor(height)

    postResize(this.worker, this._width, this._height)
  }
  
  destroy(): void {
    this.resolveAllPendingRequests()
    terminateWorker(this.worker)
    this.worker = null
    this._isReady = false
    this._hasTransferred = false
    this.useSharedInput = false
    this.inputBuffer = null
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
