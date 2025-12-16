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
import type { ElementType, RenderMode } from './types'
import { ELEMENT_NAME_TO_ID } from './data/generated_elements'
import { debugWarn } from '../log'

export { isWasmAvailable, loadWasmEngine } from './wasmEngine/loader'
import { getWasmMemory, loadWasmEngine } from './wasmEngine/loader'
import { createWorldMemoryViews } from './wasmEngine/views'
import { recreateWorldFromSnapshot } from './wasmEngine/snapshot'
import { floodFillInPlace } from './wasmEngine/fill'

type WasmModule = typeof import('@particula/engine-wasm/particula_engine')
type WasmWorld = import('@particula/engine-wasm/particula_engine').World

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
    this.world = new wasm.World(width, height)
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
    if (settings.gravity) {
      this.world.set_gravity(settings.gravity.x, settings.gravity.y)
    }
    if (settings.ambientTemperature !== undefined) {
      this.world.set_ambient_temperature(settings.ambientTemperature)
    }
  }
  
  addParticle(x: number, y: number, element: ElementType): boolean {
    if (this._isBusy) return false
    const wasmId = ELEMENT_NAME_TO_ID[element]
    if (wasmId === 0) return false  // Don't add empty
    return this.world.add_particle(Math.floor(x), Math.floor(y), wasmId)
  }
  
  addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType): void {
    if (this._isBusy) return
    const wasmId = ELEMENT_NAME_TO_ID[element]
    if (wasmId === 0) return  // Don't add empty
    this.world.add_particles_in_radius(Math.floor(cx), Math.floor(cy), Math.floor(radius), wasmId)
  }
  
  removeParticle(x: number, y: number): boolean {
    if (this._isBusy) return false
    return this.world.remove_particle(Math.floor(x), Math.floor(y))
  }
  
  removeParticlesInRadius(cx: number, cy: number, radius: number): void {
    if (this._isBusy) return
    this.world.remove_particles_in_radius(Math.floor(cx), Math.floor(cy), Math.floor(radius))
  }
  
  // === Rigid Body Methods ===
  
  /** Spawn a rectangular rigid body */
  spawnRigidBody(x: number, y: number, w: number, h: number, element: ElementType): number {
    if (this._isBusy) return 0
    const wasmId = ELEMENT_NAME_TO_ID[element] || ELEMENT_NAME_TO_ID.stone
    return this.world.spawn_rigid_body(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h), wasmId)
  }
  
  /** Spawn a circular rigid body */
  spawnRigidCircle(x: number, y: number, radius: number, element: ElementType): number {
    if (this._isBusy) return 0
    const wasmId = ELEMENT_NAME_TO_ID[element] || ELEMENT_NAME_TO_ID.stone
    return this.world.spawn_rigid_circle(Math.floor(x), Math.floor(y), Math.floor(radius), wasmId)
  }
  
  /** Remove a rigid body by ID */
  removeRigidBody(id: number): void {
    if (this._isBusy) return
    this.world.remove_rigid_body(id)
  }
  
  /** Get number of rigid bodies */
  get rigidBodyCount(): number {
    return this.world.rigid_body_count()
  }

  /** Flood fill contiguous area of the same element */
  floodFill(cx: number, cy: number, element: ElementType): void {
    if (!this.typesView) return
    const width = this._width
    const height = this._height
    const targetId = ELEMENT_NAME_TO_ID[element]
    const LIMIT = 200_000

    floodFillInPlace({
      world: this.world,
      typesView: this.typesView,
      width,
      height,
      startX: cx,
      startY: cy,
      targetId,
      limit: LIMIT,
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
    if (!this.typesView) return null
    return new Uint8Array(this.typesView)
  }
  
  /** Load snapshot (types only) */
  loadSnapshot(types: Uint8Array): void {
    const expected = this._width * this._height
    if (types.length !== expected) {
      debugWarn('Snapshot size mismatch, skipping load')
      return
    }

    this.world = recreateWorldFromSnapshot({
      wasm: this.wasm,
      width: this._width,
      height: this._height,
      types,
    })

    this.updateMemoryViews()
  }
  
  // === Phase 3: Smart Rendering API ===
  
  /** Get WASM memory for zero-copy access */
  get memory(): WebAssembly.Memory | null {
    return getWasmMemory()
  }
  
  /** Get the renderer instance */
  getRenderer(): CanvasRenderer | null {
    return this.renderer
  }
  
  /** Collect dirty chunks and return count */
  getDirtyChunksCount(): number {
    return this.world.collect_dirty_chunks()
  }
  
  /** Get pointer to dirty chunk list */
  getDirtyListPtr(): number {
    return this.world.get_dirty_list_ptr()
  }
  
  /** Extract chunk pixels to transfer buffer, returns pointer */
  extractChunkPixels(chunkIdx: number): number {
    return this.world.extract_chunk_pixels(chunkIdx)
  }
  
  /** Get chunks X count */
  getChunksX(): number {
    return this.world.chunks_x()
  }
  
  /** Get chunks Y count */
  getChunksY(): number {
    return this.world.chunks_y()
  }
  
  /** Get total chunks count */
  getTotalChunks(): number {
    return this.world.chunks_x() * this.world.chunks_y()
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
    this.world = new this.wasm.World(width, height)
    this.updateMemoryViews()
    this.renderer?.resize(width, height)
  }
  
  destroy(): void {
    // WASM world will be garbage collected
  }

  /** Read element id at world coordinate */
  getElementAt(x: number, y: number): number {
    if (!this.typesView) return 0
    if (x < 0 || y < 0 || x >= this._width || y >= this._height) return 0
    return this.typesView[y * this._width + x] ?? 0
  }
}
