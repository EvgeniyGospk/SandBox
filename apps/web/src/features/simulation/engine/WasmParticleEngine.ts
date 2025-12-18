/**
 * WasmParticleEngine - WASM-powered particle simulation
 * 
 * Phase 3: Maximum performance with Rust + WebAssembly
 * 
 * The simulation runs entirely in WASM. JS only handles:
 * - Initialization
 * - User input (add/remove particles)
 * - Rendering (reading from WASM memory)
 */

import { CanvasRenderer } from './rendering/Renderer'
import type { ElementType, RenderMode } from './api/types'
import { debugWarn } from '@/platform/logging/log'

export { isWasmAvailable, loadWasmEngine } from './wasm/loader'
import { getWasmMemory, loadWasmEngine } from './wasm/loader'
import type { WasmModule, WasmWorld } from './wasm/types'
import { createWorldMemoryViews } from './wasm/views'
import { createWorld } from './wasm/worldAdapter'
import { applySettings } from './wasm/api/settings'
import {
  addParticle as addParticleImpl,
  addParticlesInRadius as addParticlesInRadiusImpl,
  removeParticle as removeParticleImpl,
  removeParticlesInRadius as removeParticlesInRadiusImpl,
} from './wasm/api/particles'
import {
  rigidBodyCount as rigidBodyCountImpl,
  removeRigidBody as removeRigidBodyImpl,
  spawnRigidBody as spawnRigidBodyImpl,
  spawnRigidCircle as spawnRigidCircleImpl,
} from './wasm/api/rigidBodies'
import { floodFill as floodFillImpl } from './wasm/api/fill'
import { loadSnapshot as loadSnapshotImpl, saveSnapshot as saveSnapshotImpl } from './wasm/api/snapshots'
import { getElementAt as getElementAtImpl } from './wasm/api/read'

export class WasmParticleEngine {
  private world: WasmWorld
  private renderer: CanvasRenderer | null = null
  private wasm: WasmModule
  
  private _width: number
  private _height: number
  
  // TypedArray views into WASM memory (updated each frame)
  private typesView: Uint8Array | null = null
  private colorsView: Uint32Array | null = null
  private temperatureView: Float32Array | null = null
  
  // Prevent recursive WASM calls
  private _isBusy: boolean = false
  
  private constructor(wasm: WasmModule, width: number, height: number) {
    this.wasm = wasm
    this._width = width
    this._height = height
    this.world = createWorld({ wasm, width, height })
    this.updateMemoryViews()
  }
  
  /**
   * Create WasmParticleEngine (async factory)
   */
  static async create(width: number, height: number): Promise<WasmParticleEngine> {
    const wasm = await loadWasmEngine()
    return new WasmParticleEngine(wasm, width, height)
  }
  
  /**
   * Update TypedArray views into WASM memory
   */
  private updateMemoryViews(): void {
    const wasmMemory = getWasmMemory()
    if (!wasmMemory) return

    const views = createWorldMemoryViews(this.world, wasmMemory)
    this.typesView = views.types
    this.colorsView = views.colors
    this.temperatureView = views.temperature
  }
  
  // === Public API ===
  
  get width(): number { return this._width }
  get height(): number { return this._height }
  get particleCount(): number { return this.world.particle_count }
  get frame(): number { return Number(this.world.frame) }
  
  attachRenderer(ctx: CanvasRenderingContext2D): void {
    this.renderer = new CanvasRenderer(ctx, this._width, this._height)
  }
  
  setSettings(settings: { gravity?: { x: number; y: number }; ambientTemperature?: number }): void {
    applySettings(this.world, settings)
  }
  
  addParticle(x: number, y: number, element: ElementType): boolean {
    if (this._isBusy) return false
    return addParticleImpl({ world: this.world, x, y, element })
  }
  
  addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType): void {
    if (this._isBusy) return
    addParticlesInRadiusImpl({ world: this.world, cx, cy, radius, element })
  }
  
  removeParticle(x: number, y: number): boolean {
    if (this._isBusy) return false
    return removeParticleImpl({ world: this.world, x, y })
  }
  
  removeParticlesInRadius(cx: number, cy: number, radius: number): void {
    if (this._isBusy) return
    removeParticlesInRadiusImpl({ world: this.world, cx, cy, radius })
  }
  
  // === Rigid Body Methods ===
  
  /** Spawn a rectangular rigid body */
  spawnRigidBody(x: number, y: number, w: number, h: number, element: ElementType): number {
    if (this._isBusy) return 0
    return spawnRigidBodyImpl({ world: this.world, x, y, w, h, element })
  }
  
  /** Spawn a circular rigid body */
  spawnRigidCircle(x: number, y: number, radius: number, element: ElementType): number {
    if (this._isBusy) return 0
    return spawnRigidCircleImpl({ world: this.world, x, y, radius, element })
  }
  
  /** Remove a rigid body by ID */
  removeRigidBody(id: number): void {
    if (this._isBusy) return
    removeRigidBodyImpl(this.world, id)
  }
  
  /** Get number of rigid bodies */
  get rigidBodyCount(): number {
    return rigidBodyCountImpl(this.world)
  }

  /** Flood fill contiguous area of the same element */
  floodFill(cx: number, cy: number, element: ElementType): void {
    floodFillImpl({
      world: this.world,
      typesView: this.typesView,
      width: this._width,
      height: this._height,
      cx,
      cy,
      element,
    })

    // Memory views might change if world resized
    this.updateMemoryViews()
  }
  
  clear(): void {
    if (this._isBusy) return
    this.world.clear()
  }
  
  step(): void {
    if (this._isBusy) return
    this._isBusy = true
    try {
      this.world.step()
      // Memory views may need to be refreshed if WASM memory grew
      this.updateMemoryViews()
    } finally {
      this._isBusy = false
    }
  }
  
  render(): void {
    if (!this.renderer || !this.typesView || !this.colorsView) return
    
    // Render directly from WASM memory - zero copy!
    // Pass temperature for thermal view mode
    this.renderer.render(this.typesView, this.colorsView, this.temperatureView ?? undefined)
  }
  
  /** Snapshot world types (Uint8Array copy) */
  saveSnapshot(): Uint8Array | null {
    return saveSnapshotImpl(this.typesView)
  }
  
  /** Load snapshot (types only) */
  loadSnapshot(types: Uint8Array): void {
    const nextWorld = loadSnapshotImpl({
      wasm: this.wasm,
      width: this._width,
      height: this._height,
      types,
      warn: debugWarn,
    })
    if (!nextWorld) return

    this.world = nextWorld

    this.updateMemoryViews()
  }
  
  /** Get WASM memory for zero-copy access */
  get memory(): WebAssembly.Memory | null {
    return getWasmMemory()
  }
  
  /** Get the renderer instance */
  getRenderer(): CanvasRenderer | null {
    return this.renderer
  }
  
  setRenderMode(mode: RenderMode): void {
    this.renderer?.setMode(mode)
  }
  
  getRenderMode(): RenderMode {
    return this.renderer?.getMode() ?? 'normal'
  }
  
  setTransform(zoom: number, panX: number, panY: number): void {
    this.renderer?.setTransform(zoom, panX, panY)
  }
  
  resize(width: number, height: number): void {
    // Create new world with new dimensions
    this._width = width
    this._height = height
    this.world = createWorld({ wasm: this.wasm, width, height })
    this.updateMemoryViews()
    this.renderer?.resize(width, height)
  }
  
  destroy(): void {
    // WASM world will be garbage collected
  }

  /** Read element id at world coordinate */
  getElementAt(x: number, y: number): number {
    return getElementAtImpl({ typesView: this.typesView, width: this._width, height: this._height, x, y })
  }
}
