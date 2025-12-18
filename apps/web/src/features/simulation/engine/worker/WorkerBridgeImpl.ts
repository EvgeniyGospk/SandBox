/**
 * WorkerBridge - Main thread interface to simulation worker
 * 
 * Phase 5: Uses SharedArrayBuffer Ring Buffer for zero-latency input!
 * 
 * Provides the same API as WasmParticleEngine but delegates to worker.
 * Main thread never touches WASM directly.
 */

import type { ElementId, RenderMode, ToolType } from '../api/types'
import { debugWarn, logError } from '@/platform/logging/log'
import { parseWorkerToMainMessage, SIMULATION_PROTOCOL_VERSION } from '../protocol/index'
import type { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'

import {
  createRequestState,
  resolveAllPendingRequests,
  postLoadContentBundle,
  type CrashBehavior,
  type ErrorBehavior,
  type UnknownMessageMode,
  type RequestTimeoutKind,
  type RequestTimeouts,
} from './bridge'
import { createSimulationWorker } from './services/createSimulationWorker'
import { initExistingWorkerBridge } from './services/initExistingWorkerBridge'
import * as playback from './services/playback'
import { screenToWorld } from './services/coords'
import * as input from './services/input'
import * as requests from './services/requests'
import * as settings from './services/settings'
import * as rigidBody from './services/rigidBody'
import { setTransform as postTransform } from './services/transform'
import { destroyBridge, resizeWorld, setViewportSize } from './services/lifecycle'
import type {
  ContentManifestCallback,
  ContentBundleStatusCallback,
  CrashCallback,
  ErrorCallback,
  ReadyCallback,
  SimulationStats,
  StatsCallback,
} from './bridgeTypes'
import {
  isCrossOriginIsolated as isCrossOriginIsolatedImpl,
  isSharedMemorySupported as isSharedMemorySupportedImpl,
  isWorkerSupported as isWorkerSupportedImpl,
} from './capabilities'

export type { StatsCallback, ReadyCallback, ErrorCallback, CrashCallback } from './bridgeTypes'

export type WorkerBridgeLifecycle = 'INIT' | 'READY' | 'RUNNING' | 'CRASHED' | 'DEAD'

export type WorkerBridgeOptions = {
  unknownMessageMode?: UnknownMessageMode
  errorBehavior?: ErrorBehavior
  crashBehavior?: CrashBehavior
}

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
  private _everTransferred: boolean = false

  private _lifecycle: WorkerBridgeLifecycle = 'INIT'
  
  // Phase 5: Shared input buffer for zero-latency input
  private inputBuffer: SharedInputBuffer | null = null
  private useSharedInput: boolean = false
  private requests = createRequestState({
    onTimeout: ({ kind, id, timeoutMs }) => {
      this.onRequestTimeout?.({ kind, id, timeoutMs })
    },
  })
  
  // Callbacks
  public onStats: StatsCallback | null = null
  public onReady: ReadyCallback | null = null
  public onError: ErrorCallback | null = null
  public onCrash: CrashCallback | null = null  // Phase 5: Crash recovery
  public onContentManifest: ContentManifestCallback | null = null
  public onContentBundleStatus: ContentBundleStatusCallback | null = null

  public onRequestTimeout:
    | ((args: { kind: RequestTimeoutKind; id: number; timeoutMs: number }) => void)
    | null = null
  
  // Camera state (stored on main thread for coordinate conversion)
  private zoom: number = 1
  private panX: number = 0
  private panY: number = 0
  
  private options: Required<WorkerBridgeOptions>

  constructor(options?: WorkerBridgeOptions) {
    this.options = {
      unknownMessageMode: options?.unknownMessageMode ?? 'strict',
      errorBehavior: options?.errorBehavior ?? 'terminate',
      crashBehavior: options?.crashBehavior ?? 'terminateIfUnrecoverable',
    }
  }

  get lifecycle(): WorkerBridgeLifecycle {
    return this._lifecycle
  }

  setRequestTimeouts(timeouts: Partial<RequestTimeouts>): void {
    this.requests.timeouts = {
      ...this.requests.timeouts,
      ...timeouts,
    }
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
    this._everTransferred = false
    this.useSharedInput = false
    this.inputBuffer = null

    this._lifecycle = 'INIT'
    this.requests = createRequestState({
      timeouts: this.requests.timeouts,
      onTimeout: ({ kind, id, timeoutMs }) => {
        this.onRequestTimeout?.({ kind, id, timeoutMs })
      },
    })

    // Create worker
    const worker = createSimulationWorker()
    this.worker = worker
    this._width = Math.floor(worldWidth)
    this._height = Math.floor(worldHeight)
    // Store viewport size for coordinate conversion (before canvas is transferred!)
    this._viewportWidth = Math.floor(viewportWidth ?? canvas.width)
    this._viewportHeight = Math.floor(viewportHeight ?? canvas.height)
    try {
      await initExistingWorkerBridge({
        worker,
        canvas,

        width: this._width,
        height: this._height,
        viewportWidth: this._viewportWidth,
        viewportHeight: this._viewportHeight,

        expectedProtocolVersion: SIMULATION_PROTOCOL_VERSION,
        parseMessage: parseWorkerToMainMessage,

        requests: this.requests,

        onUnknownMessage: (data) => {
          debugWarn('WorkerBridge: Unknown worker message', data)
        },
        onReady: (width, height) => {
          this._isReady = true
          this._lifecycle = 'READY'
          this._width = width
          this._height = height
          this.onReady?.(width, height)
        },
        onStats: (stats: SimulationStats) => {
          this.onStats?.(stats)
        },
        onContentManifest: (json: string) => {
          this.onContentManifest?.(json)
        },
        onContentBundleStatus: (args) => {
          this.onContentBundleStatus?.(args)
        },
        onError: (message) => {
          this.onError?.(message)
        },
        onCrash: (message, canRecover) => {
          this._lifecycle = 'CRASHED'
          logError('💥 WASM Crash:', message)
          this.onCrash?.(message, canRecover ?? true)
        },

        resolveAllPendingRequests: () => resolveAllPendingRequests(this.requests),
        destroy: () => this.destroy(),

        setHasTransferred: (v) => {
          this._hasTransferred = v
          if (v) this._everTransferred = true
        },
        setInputBuffer: (buf) => {
          this.inputBuffer = buf
        },
        setUseSharedInput: (v) => {
          this.useSharedInput = v
        },

        unknownMessageMode: this.options.unknownMessageMode,
        errorBehavior: this.options.errorBehavior,
        crashBehavior: this.options.crashBehavior,
      })
    } catch (err) {
      if (this.worker === worker) this.worker = null
      throw err
    }
  }
  
  // === Getters ===
  
  get width(): number { return this._width }
  get height(): number { return this._height }
  get isReady(): boolean { return this._isReady }
  get hasTransferred(): boolean { return this._hasTransferred }
  get everTransferred(): boolean { return this._everTransferred }
  
  // === Playback Control ===
  
  play(): void {
    if (!this.worker) return
    if (this._lifecycle === 'CRASHED' || this._lifecycle === 'DEAD') return
    if (!this._isReady) return
    this._lifecycle = 'RUNNING'
    playback.play(this.worker)
  }

  pause(): void {
    if (!this.worker) return
    if (this._lifecycle === 'CRASHED' || this._lifecycle === 'DEAD') return
    if (this._lifecycle === 'RUNNING') this._lifecycle = 'READY'
    playback.pause(this.worker)
  }

  step(): void {
    playback.step(this.worker)
  }
  
  clear(): void {
    playback.clear(this.worker)
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
    elementId: number,
    tool: ToolType,
    brushShape: 'circle' | 'square' | 'line' = 'circle'
  ): void {
    const { worldX, worldY } = screenToWorld({
      screenX,
      screenY,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      viewportWidth: this._viewportWidth,
      viewportHeight: this._viewportHeight,
      worldWidth: this._width,
      worldHeight: this._height,
    })

    input.sendBrushInput({
      worker: this.worker,
      useSharedInput: this.useSharedInput,
      inputBuffer: this.inputBuffer,
      tool,
      elementId,
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
  addParticles(screenX: number, screenY: number, radius: number, elementId: number): void {
    this.handleInput(screenX, screenY, radius, elementId, 'brush')
  }
  
  /**
   * Shorthand for eraser tool
   */
  removeParticles(screenX: number, screenY: number, radius: number): void {
    this.handleInput(screenX, screenY, radius, 0, 'eraser')
  }

  /**
   * Flood fill tool (worker only)
   */
  fill(screenX: number, screenY: number, elementId: number): void {
    const { worldX, worldY } = screenToWorld({
      screenX,
      screenY,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      viewportWidth: this._viewportWidth,
      viewportHeight: this._viewportHeight,
      worldWidth: this._width,
      worldHeight: this._height,
    })

    input.sendFill({ worker: this.worker, worldX, worldY, elementId })
  }
  
  /**
   * Spawn a rigid body at world coordinates
   */
  spawnRigidBody(
    worldX: number, 
    worldY: number, 
    size: number, 
    shape: 'box' | 'circle', 
    elementId: number
  ): void {
    rigidBody.spawnRigidBody({
      worker: this.worker,
      x: Math.floor(worldX),
      y: Math.floor(worldY),
      size: Math.floor(size),
      shape,
      elementId,
    })
  }

  /**
   * Pipette tool - returns element under cursor
   */
  pipette(screenX: number, screenY: number): Promise<ElementId | null> {
    return requests.pipette({ requests: this.requests, worker: this.worker, screenX, screenY })
  }

  /**
   * Capture snapshot of world (types only)
   */
  saveSnapshot(): Promise<ArrayBuffer | null> {
    return requests.snapshot({ requests: this.requests, worker: this.worker })
  }

  /**
   * Load snapshot buffer (must match world dimensions)
   */
  loadSnapshot(buffer: ArrayBuffer): void {
    requests.loadSnapshot({ worker: this.worker, buffer })
  }

  loadContentBundle(json: string): void {
    if (!this.worker) return
    if (this._lifecycle === 'CRASHED' || this._lifecycle === 'DEAD') return
    if (!this._isReady) return
    postLoadContentBundle(this.worker, json)
  }
  
  /**
   * Signal end of stroke (mouseUp) - resets Bresenham interpolation
   * CRITICAL: Must be called on mouseUp to prevent lines between strokes!
   * Uses SAB sentinel when available to prevent race conditions!
   */
  endStroke(): void {
    input.endStroke({ worker: this.worker, useSharedInput: this.useSharedInput, inputBuffer: this.inputBuffer })
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
    const { worldX, worldY } = screenToWorld({
      screenX,
      screenY,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      viewportWidth: this._viewportWidth,
      viewportHeight: this._viewportHeight,
      worldWidth: this._width,
      worldHeight: this._height,
    })
    return { x: worldX, y: worldY }
  }
  
  // === Settings ===
  
  setSettings(nextSettings: {
    gravity?: { x: number; y: number }
    ambientTemperature?: number
    speed?: number
  }): void {
    settings.setSettings(this.worker, nextSettings)
  }
  
  setRenderMode(mode: RenderMode): void {
    settings.setRenderMode(this.worker, mode)
  }
  
  // === Lifecycle ===

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = Math.floor(width)
    this._viewportHeight = Math.floor(height)
    setViewportSize(this.worker, this._viewportWidth, this._viewportHeight)
  }

  resize(width: number, height: number): void {
    this._width = Math.floor(width)
    this._height = Math.floor(height)

    resizeWorld(this.worker, this._width, this._height)
  }
  
  destroy(): void {
    destroyBridge(this.worker, this.requests)
    this.worker = null
    this._isReady = false
    this._hasTransferred = false
    this.useSharedInput = false
    this.inputBuffer = null
    if (this._lifecycle !== 'CRASHED') this._lifecycle = 'DEAD'
  }
}

/**
 * Check if WebWorkers with OffscreenCanvas are supported
 */
export function isWorkerSupported(): boolean {
  return isWorkerSupportedImpl()
}

/**
 * Check if SharedArrayBuffer is available (COOP/COEP headers set)
 */
export function isSharedMemorySupported(): boolean {
  return isSharedMemorySupportedImpl()
}

/**
 * Check whether the page is cross-origin isolated (COOP/COEP configured).
 */
export function isCrossOriginIsolated(): boolean {
  return isCrossOriginIsolatedImpl()
}
