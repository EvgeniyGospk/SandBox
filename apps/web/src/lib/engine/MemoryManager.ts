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

export class MemoryManager {
  private memory: WebAssembly.Memory
  private engine: any  // WASM World instance
  
  // Cached views (recreated on buffer detach)
  private _types: Uint8Array | null = null
  private _colors: Uint32Array | null = null
  private _temperature: Float32Array | null = null
  
  // Track buffer state for detach detection
  private lastByteLength: number = 0
  private lastTypesPtr: number = 0
  private lastColorsPtr: number = 0
  private lastTempPtr: number = 0
  
  constructor(memory: WebAssembly.Memory, engine: any) {
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
    try {
      const currentLength = this.memory.buffer.byteLength
      if (currentLength !== this.lastByteLength) {
        return true
      }
      
      // Also check if pointers changed (world was recreated)
      const typesPtr = this.engine.types_ptr()
      const colorsPtr = this.engine.colors_ptr()
      const tempPtr = this.engine.temperature_ptr()
      
      if (typesPtr !== this.lastTypesPtr ||
          colorsPtr !== this.lastColorsPtr ||
          tempPtr !== this.lastTempPtr) {
        return true
      }
      
      return false
    } catch {
      // If we can't access buffer, it's definitely stale
      return true
    }
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
      const size = this.engine.types_len()
      const typesPtr = this.engine.types_ptr()
      const colorsPtr = this.engine.colors_ptr()
      const tempPtr = this.engine.temperature_ptr()
      
      this._types = new Uint8Array(this.memory.buffer, typesPtr, size)
      this._colors = new Uint32Array(this.memory.buffer, colorsPtr, size)
      this._temperature = new Float32Array(this.memory.buffer, tempPtr, size)
      
      // Update tracking
      this.lastByteLength = this.memory.buffer.byteLength
      this.lastTypesPtr = typesPtr
      this.lastColorsPtr = colorsPtr
      this.lastTempPtr = tempPtr
      
      console.log(`🔒 MemoryManager: Views rebuilt (${size} cells, ${this.lastByteLength} bytes)`)
    } catch (e) {
      console.error('MemoryManager: Failed to rebuild views:', e)
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
