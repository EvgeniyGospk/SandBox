/**
 * MemoryManager - Safe WASM Memory Access (Phase 3: Fort Knox)
 * 
 * Problem: WASM memory can grow dynamically (resize in Rust).
 * When this happens, the underlying ArrayBuffer is DETACHED,
 * and all existing TypedArray views become invalid.
 * 
 * Solution: Never store views as long-lived variables.
 * Always access memory through this manager, which automatically
 * detects detached buffers and recreates views.
 * 
 * Usage:
 *   const mm = new MemoryManager(wasmMemory, engine)
 *   const types = mm.types  // Always valid!
 *   const colors = mm.colors // Always valid!
 */

import { debugLog, logError } from '../logging/log'

import { isStale as isStaleImpl } from './memoryManager/isStale'
import { readWorldPointers } from './memoryManager/pointers'
import { updateTracking } from './memoryManager/tracking'
import { createWorldViews } from './memoryManager/views'

type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export class MemoryManager {
  private memory: WebAssembly.Memory
  private engine: WasmWorld  // WASM World instance
  
  // Cached views (recreated on buffer detach)
  private _types: Uint8Array | null = null
  private _colors: Uint32Array | null = null
  private _temperature: Float32Array | null = null
  
  // Track buffer state for detach detection
  private lastByteLength: number = 0
  private lastTypesPtr: number = 0
  private lastColorsPtr: number = 0
  private lastTempPtr: number = 0
  
  constructor(memory: WebAssembly.Memory, engine: WasmWorld) {
    this.memory = memory
    this.engine = engine
    this.rebuildViews()
  }
  
  /**
   * Check if memory buffer was detached or resized
   */
  private isStale(): boolean {
    // Check if buffer was detached (byteLength becomes 0)
    // or if memory grew (byteLength changed)
    // Also check if pointers changed (world was recreated)
    // If we can't access buffer, it's definitely stale
    return isStaleImpl({
      memory: this.memory,
      engine: this.engine,
      tracking: {
        lastByteLength: this.lastByteLength,
        lastTypesPtr: this.lastTypesPtr,
        lastColorsPtr: this.lastColorsPtr,
        lastTempPtr: this.lastTempPtr,
      },
    })
  }
  
  /**
   * Ensure views are valid, rebuild if necessary
   */
  private ensureValid(): void {
    if (this.isStale()) {
      this.rebuildViews()
    }
  }
  
  /**
   * Rebuild all TypedArray views from current WASM memory
   */
  rebuildViews(): void {
    try {
      const ptrs = readWorldPointers(this.engine)

      const views = createWorldViews(this.memory, ptrs)
      this._types = views.types
      this._colors = views.colors
      this._temperature = views.temperature

      // Update tracking
      const tracking = updateTracking({ memory: this.memory, pointers: ptrs })
      this.lastByteLength = tracking.lastByteLength
      this.lastTypesPtr = tracking.lastTypesPtr
      this.lastColorsPtr = tracking.lastColorsPtr
      this.lastTempPtr = tracking.lastTempPtr
      
      debugLog(`🔒 MemoryManager: Views rebuilt (${ptrs.size} cells, ${this.lastByteLength} bytes)`)
    } catch (e) {
      logError('MemoryManager: Failed to rebuild views:', e)
      this._types = null
      this._colors = null
      this._temperature = null
    }
  }
  
  /**
   * Force rebuild (call after engine.step() if memory might have grown)
   */
  refresh(): void {
    if (this.isStale()) {
      this.rebuildViews()
    }
  }
  
  // === Safe Getters ===
  
  /**
   * Get types view (element IDs) - always valid
   */
  get types(): Uint8Array {
    this.ensureValid()
    if (!this._types) {
      throw new Error('MemoryManager: types view unavailable')
    }
    return this._types
  }
  
  /**
   * Get colors view (RGBA packed as u32) - always valid
   */
  get colors(): Uint32Array {
    this.ensureValid()
    if (!this._colors) {
      throw new Error('MemoryManager: colors view unavailable')
    }
    return this._colors
  }
  
  /**
   * Get temperature view (f32 per cell) - always valid
   */
  get temperature(): Float32Array {
    this.ensureValid()
    if (!this._temperature) {
      throw new Error('MemoryManager: temperature view unavailable')
    }
    return this._temperature
  }
  
  /**
   * Get raw memory view (for WebGL uploads) - always valid
   */
  get memoryView(): Uint8Array {
    this.ensureValid()
    return new Uint8Array(this.memory.buffer)
  }
  
  /**
   * Check if views are currently valid
   */
  get isValid(): boolean {
    return !this.isStale() && 
           this._types !== null && 
           this._colors !== null && 
           this._temperature !== null
  }
  
  /**
   * Get current memory buffer size
   */
  get bufferSize(): number {
    return this.memory.buffer.byteLength
  }
}
