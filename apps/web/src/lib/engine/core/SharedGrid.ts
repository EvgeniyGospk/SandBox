/**
 * SharedGrid - Grid backed by SharedArrayBuffer
 * 
 * Phase 2: Multi-threaded simulation
 * 
 * This grid can be shared between Main Thread and Web Workers.
 * Both threads see the same memory - no copying needed!
 * 
 * Usage:
 *   Main Thread: Creates SharedGrid, passes buffers to Worker
 *   Worker: Receives buffers, creates views, runs simulation
 *   Main Thread: Reads updated data for rendering
 */

import { 
  ElementId, 
  EL_EMPTY,
  Particle,
  ELEMENT_NAME_TO_ID,
  ELEMENT_ID_TO_NAME
} from '../types'
import { IGrid } from './Grid'

// Background color as ABGR (for ImageData)
const BG_COLOR = 0xFF0A0A0A

/**
 * Buffers that can be transferred to a Worker
 */
export interface SharedGridBuffers {
  types: SharedArrayBuffer
  colors: SharedArrayBuffer
  life: SharedArrayBuffer
  updated: SharedArrayBuffer
  temperature: SharedArrayBuffer
  width: number
  height: number
}

/**
 * Check if SharedArrayBuffer is available
 */
export function isSharedArrayBufferAvailable(): boolean {
  try {
    new SharedArrayBuffer(1)
    return true
  } catch {
    return false
  }
}

export class SharedGrid implements IGrid {
  private _width: number
  private _height: number
  private _size: number
  
  // Shared buffers (can be transferred to workers)
  private _typesBuffer: SharedArrayBuffer
  private _colorsBuffer: SharedArrayBuffer
  private _lifeBuffer: SharedArrayBuffer
  private _updatedBuffer: SharedArrayBuffer
  private _temperatureBuffer: SharedArrayBuffer
  
  // TypedArray views over shared buffers
  public types: Uint8Array
  public colors: Uint32Array
  private life: Uint16Array
  private updated: Uint8Array
  public temperature: Float32Array
  
  constructor(width: number, height: number) {
    this._width = Math.max(1, Math.floor(width))
    this._height = Math.max(1, Math.floor(height))
    this._size = this._width * this._height
    
    // Allocate SharedArrayBuffers
    this._typesBuffer = new SharedArrayBuffer(this._size)
    this._colorsBuffer = new SharedArrayBuffer(this._size * 4)  // Uint32 = 4 bytes
    this._lifeBuffer = new SharedArrayBuffer(this._size * 2)    // Uint16 = 2 bytes
    this._updatedBuffer = new SharedArrayBuffer(this._size)
    this._temperatureBuffer = new SharedArrayBuffer(this._size * 4)  // Float32 = 4 bytes
    
    // Create views
    this.types = new Uint8Array(this._typesBuffer)
    this.colors = new Uint32Array(this._colorsBuffer)
    this.life = new Uint16Array(this._lifeBuffer)
    this.updated = new Uint8Array(this._updatedBuffer)
    this.temperature = new Float32Array(this._temperatureBuffer)
    
    // Initialize
    this.colors.fill(BG_COLOR)
    this.temperature.fill(20)
  }
  
  /**
   * Create SharedGrid from existing buffers (used in Worker)
   */
  static fromBuffers(buffers: SharedGridBuffers): SharedGrid {
    const grid = Object.create(SharedGrid.prototype) as SharedGrid
    
    grid._width = buffers.width
    grid._height = buffers.height
    grid._size = buffers.width * buffers.height
    
    grid._typesBuffer = buffers.types
    grid._colorsBuffer = buffers.colors
    grid._lifeBuffer = buffers.life
    grid._updatedBuffer = buffers.updated
    grid._temperatureBuffer = buffers.temperature
    
    grid.types = new Uint8Array(buffers.types)
    grid.colors = new Uint32Array(buffers.colors)
    grid.life = new Uint16Array(buffers.life)
    grid.updated = new Uint8Array(buffers.updated)
    grid.temperature = new Float32Array(buffers.temperature)
    
    return grid
  }
  
  /**
   * Get buffers for transfer to Worker
   */
  getBuffers(): SharedGridBuffers {
    return {
      types: this._typesBuffer,
      colors: this._colorsBuffer,
      life: this._lifeBuffer,
      updated: this._updatedBuffer,
      temperature: this._temperatureBuffer,
      width: this._width,
      height: this._height,
    }
  }
  
  get width(): number { return this._width }
  get height(): number { return this._height }
  
  // === Index conversion ===
  index(x: number, y: number): number {
    return y * this._width + x
  }
  
  coords(idx: number): { x: number; y: number } {
    return {
      x: idx % this._width,
      y: Math.floor(idx / this._width)
    }
  }
  
  // === Bounds checking ===
  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this._width && y >= 0 && y < this._height
  }
  
  isEmpty(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false
    return this.types[this.index(x, y)] === EL_EMPTY
  }
  
  isEmptyIdx(idx: number): boolean {
    return this.types[idx] === EL_EMPTY
  }
  
  // === Type access ===
  getType(x: number, y: number): ElementId {
    if (!this.inBounds(x, y)) return EL_EMPTY
    return this.types[this.index(x, y)]
  }
  
  getTypeIdx(idx: number): ElementId {
    return this.types[idx]
  }
  
  setType(x: number, y: number, type: ElementId): void {
    if (!this.inBounds(x, y)) return
    this.types[this.index(x, y)] = type
  }
  
  setTypeIdx(idx: number, type: ElementId): void {
    this.types[idx] = type
  }
  
  // === Color access ===
  getColor(x: number, y: number): number {
    if (!this.inBounds(x, y)) return BG_COLOR
    return this.colors[this.index(x, y)]
  }
  
  getColorIdx(idx: number): number {
    return this.colors[idx]
  }
  
  setColor(x: number, y: number, color: number): void {
    if (!this.inBounds(x, y)) return
    this.colors[this.index(x, y)] = color
  }
  
  setColorIdx(idx: number, color: number): void {
    this.colors[idx] = color
  }
  
  // === Lifetime access ===
  getLife(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0
    return this.life[this.index(x, y)]
  }
  
  getLifeIdx(idx: number): number {
    return this.life[idx]
  }
  
  setLife(x: number, y: number, life: number): void {
    if (!this.inBounds(x, y)) return
    this.life[this.index(x, y)] = life
  }
  
  setLifeIdx(idx: number, life: number): void {
    this.life[idx] = life
  }
  
  // === Updated flag ===
  isUpdated(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true
    return this.updated[this.index(x, y)] === 1
  }
  
  isUpdatedIdx(idx: number): boolean {
    return this.updated[idx] === 1
  }
  
  setUpdated(x: number, y: number, upd: boolean): void {
    if (!this.inBounds(x, y)) return
    this.updated[this.index(x, y)] = upd ? 1 : 0
  }
  
  setUpdatedIdx(idx: number, upd: boolean): void {
    this.updated[idx] = upd ? 1 : 0
  }
  
  resetUpdated(): void {
    this.updated.fill(0)
  }
  
  // === Temperature access ===
  getTemp(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 20
    return this.temperature[this.index(x, y)]
  }
  
  getTempIdx(idx: number): number {
    return this.temperature[idx]
  }
  
  setTemp(x: number, y: number, temp: number): void {
    if (!this.inBounds(x, y)) return
    this.temperature[this.index(x, y)] = temp
  }
  
  setTempIdx(idx: number, temp: number): void {
    this.temperature[idx] = temp
  }
  
  // === Swap two cells ===
  swap(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) return
    this.swapIdx(this.index(x1, y1), this.index(x2, y2))
  }
  
  swapIdx(idx1: number, idx2: number): void {
    // Swap types
    const t = this.types[idx1]
    this.types[idx1] = this.types[idx2]
    this.types[idx2] = t
    
    // Swap colors
    const c = this.colors[idx1]
    this.colors[idx1] = this.colors[idx2]
    this.colors[idx2] = c
    
    // Swap life
    const l = this.life[idx1]
    this.life[idx1] = this.life[idx2]
    this.life[idx2] = l
    
    // Swap updated
    const u = this.updated[idx1]
    this.updated[idx1] = this.updated[idx2]
    this.updated[idx2] = u
    
    // Swap temperature
    const temp = this.temperature[idx1]
    this.temperature[idx1] = this.temperature[idx2]
    this.temperature[idx2] = temp
  }
  
  // === Set particle with all data ===
  setParticle(x: number, y: number, type: ElementId, color: number, life: number, temp: number): void {
    if (!this.inBounds(x, y)) return
    const idx = this.index(x, y)
    this.types[idx] = type
    this.colors[idx] = color
    this.life[idx] = life
    this.temperature[idx] = temp
    this.updated[idx] = 1
  }
  
  // === Clear single cell ===
  clearCell(x: number, y: number): void {
    if (!this.inBounds(x, y)) return
    const idx = this.index(x, y)
    this.types[idx] = EL_EMPTY
    this.colors[idx] = BG_COLOR
    this.life[idx] = 0
    this.temperature[idx] = 20
  }
  
  // === Legacy compatibility ===
  get(x: number, y: number): Particle | null {
    if (!this.inBounds(x, y)) return null
    const idx = this.index(x, y)
    const type = this.types[idx]
    if (type === EL_EMPTY) return null
    
    return {
      element: ELEMENT_ID_TO_NAME[type],
      color: this.colors[idx],
      updated: this.updated[idx] === 1,
      lifetime: this.life[idx]
    }
  }
  
  set(x: number, y: number, particle: Particle | null): void {
    if (!this.inBounds(x, y)) return
    const idx = this.index(x, y)
    
    if (particle === null) {
      this.types[idx] = EL_EMPTY
      this.colors[idx] = BG_COLOR
      this.life[idx] = 0
    } else {
      this.types[idx] = ELEMENT_NAME_TO_ID[particle.element]
      this.colors[idx] = particle.color
      this.life[idx] = particle.lifetime
      this.updated[idx] = particle.updated ? 1 : 0
    }
  }
  
  // === Clear entire grid ===
  clear(): void {
    this.types.fill(EL_EMPTY)
    this.colors.fill(BG_COLOR)
    this.life.fill(0)
    this.updated.fill(0)
    this.temperature.fill(20)
  }
  
  // === Resize grid ===
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width))
    const h = Math.max(1, Math.floor(height))
    const newSize = w * h
    
    // Allocate new SharedArrayBuffers
    const newTypesBuffer = new SharedArrayBuffer(newSize)
    const newColorsBuffer = new SharedArrayBuffer(newSize * 4)
    const newLifeBuffer = new SharedArrayBuffer(newSize * 2)
    const newUpdatedBuffer = new SharedArrayBuffer(newSize)
    const newTempBuffer = new SharedArrayBuffer(newSize * 4)
    
    const newTypes = new Uint8Array(newTypesBuffer)
    const newColors = new Uint32Array(newColorsBuffer)
    const newLife = new Uint16Array(newLifeBuffer)
    const newUpdated = new Uint8Array(newUpdatedBuffer)
    const newTemp = new Float32Array(newTempBuffer)
    
    // Initialize with defaults
    newColors.fill(BG_COLOR)
    newTemp.fill(20)
    
    // Copy existing data that fits
    const minH = Math.min(this._height, h)
    const minW = Math.min(this._width, w)
    
    for (let y = 0; y < minH; y++) {
      for (let x = 0; x < minW; x++) {
        const oldIdx = y * this._width + x
        const newIdx = y * w + x
        
        newTypes[newIdx] = this.types[oldIdx]
        newColors[newIdx] = this.colors[oldIdx]
        newLife[newIdx] = this.life[oldIdx]
        newUpdated[newIdx] = this.updated[oldIdx]
        newTemp[newIdx] = this.temperature[oldIdx]
      }
    }
    
    // Replace buffers and views
    this._width = w
    this._height = h
    this._size = newSize
    
    this._typesBuffer = newTypesBuffer
    this._colorsBuffer = newColorsBuffer
    this._lifeBuffer = newLifeBuffer
    this._updatedBuffer = newUpdatedBuffer
    this._temperatureBuffer = newTempBuffer
    
    this.types = newTypes
    this.colors = newColors
    this.life = newLife
    this.updated = newUpdated
    this.temperature = newTemp
  }
  
  // === Legacy iteration ===
  forEach(callback: (particle: Particle | null, x: number, y: number, idx: number) => void): void {
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        const idx = this.index(x, y)
        callback(this.get(x, y), x, y, idx)
      }
    }
  }
  
  getCells(): (Particle | null)[] {
    const cells: (Particle | null)[] = new Array(this._size)
    for (let i = 0; i < this._size; i++) {
      if (this.types[i] === EL_EMPTY) {
        cells[i] = null
      } else {
        cells[i] = {
          element: ELEMENT_ID_TO_NAME[this.types[i]],
          color: this.colors[i],
          updated: this.updated[i] === 1,
          lifetime: this.life[i]
        }
      }
    }
    return cells
  }
}
