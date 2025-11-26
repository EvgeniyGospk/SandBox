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

import { CanvasRenderer, RenderMode } from './Renderer'
import { ElementType } from './types'

// Element name to WASM ID mapping
const ELEMENT_TO_WASM_ID: Record<ElementType, number> = {
  'empty': 0,
  'stone': 1,
  'sand': 2,
  'wood': 3,
  'metal': 4,
  'ice': 5,
  'water': 6,
  'oil': 7,
  'lava': 8,
  'acid': 9,
  'steam': 10,
  'smoke': 11,
  'fire': 12,
  'spark': 13,
  'electricity': 14,
  'gunpowder': 15,
  'clone': 16,
  'void': 17,
  'dirt': 18,
  'seed': 19,
  'plant': 20,
}

// WASM module type (will be loaded dynamically)
interface WasmModule {
  init: () => void
  version: () => string
  World: new (width: number, height: number) => WasmWorld
}

interface WasmWorld {
  width: number
  height: number
  particle_count: number
  frame: bigint
  set_gravity: (x: number, y: number) => void
  set_ambient_temperature: (temp: number) => void
  add_particle: (x: number, y: number, element: number) => boolean
  add_particles_in_radius: (cx: number, cy: number, radius: number, element: number) => void
  remove_particle: (x: number, y: number) => boolean
  remove_particles_in_radius: (cx: number, cy: number, radius: number) => void
  clear: () => void
  step: () => void
  types_ptr: () => number
  colors_ptr: () => number
  types_len: () => number
  colors_len: () => number
  temperature_ptr: () => number
  temperature_len: () => number
  // Phase 3: Smart Rendering
  collect_dirty_chunks: () => number
  get_dirty_list_ptr: () => number
  extract_chunk_pixels: (chunkIdx: number) => number
  chunks_x: () => number
  chunks_y: () => number
}

let wasmModule: WasmModule | null = null
let wasmMemory: WebAssembly.Memory | null = null

/**
 * Load WASM module
 */
export async function loadWasmEngine(): Promise<WasmModule> {
  if (wasmModule) return wasmModule
  
  try {
    // Dynamic import of WASM package
    // @ts-ignore - WASM module loaded dynamically
    const wasm = await import('@particula/engine-wasm/particula_engine')
    
    // Initialize WASM and get exports (including memory!)
    const wasmExports = await wasm.default()
    
    // Memory is in the exports returned by init
    wasmMemory = wasmExports.memory
    
    if (!wasmMemory) {
      console.error('WASM memory not found in exports:', Object.keys(wasmExports))
      throw new Error('WASM memory not available')
    }
    
    wasmModule = wasm as unknown as WasmModule
    wasmModule.init()
    
    console.log(`🦀 WASM Engine loaded, version: ${wasmModule.version()}`)
    console.log(`🦀 WASM memory size: ${wasmMemory.buffer.byteLength} bytes`)
    return wasmModule
  } catch (err) {
    console.error('Failed to load WASM engine:', err)
    throw err
  }
}

/**
 * Check if WASM is available
 */
export function isWasmAvailable(): boolean {
  return typeof WebAssembly !== 'undefined'
}

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
    if (!wasmMemory) return
    
    const typesPtr = this.world.types_ptr()
    const colorsPtr = this.world.colors_ptr()
    const tempPtr = this.world.temperature_ptr()
    const size = this.world.types_len()
    
    this.typesView = new Uint8Array(wasmMemory.buffer, typesPtr, size)
    this.colorsView = new Uint32Array(wasmMemory.buffer, colorsPtr, size)
    this.temperatureView = new Float32Array(wasmMemory.buffer, tempPtr, size)
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
    const wasmId = ELEMENT_TO_WASM_ID[element] ?? 0
    if (wasmId === 0) return false  // Don't add empty
    return this.world.add_particle(Math.floor(x), Math.floor(y), wasmId)
  }
  
  addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType): void {
    if (this._isBusy) return
    const wasmId = ELEMENT_TO_WASM_ID[element] ?? 0
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
  
  // === Phase 3: Smart Rendering API ===
  
  /** Get WASM memory for zero-copy access */
  get memory(): WebAssembly.Memory | null {
    return wasmMemory
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
}
