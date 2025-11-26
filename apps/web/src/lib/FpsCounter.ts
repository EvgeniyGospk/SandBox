/**
 * Zero-allocation FPS counter using Ring Buffer
 * 
 * Phase 4: Eliminates Array.push/shift allocations that cause GC stuttering
 * Uses Float32Array as fixed-size ring buffer
 */

export class FpsCounter {
  private buffer: Float32Array
  private index: number = 0
  private size: number
  private count: number = 0 // How many slots are actually filled

  constructor(size: number = 20) {
    this.size = size
    this.buffer = new Float32Array(size) // Single allocation at startup
  }

  /**
   * Add FPS sample - zero allocations!
   */
  add(fps: number): void {
    this.buffer[this.index] = fps
    this.index = (this.index + 1) % this.size
    if (this.count < this.size) this.count++
  }

  /**
   * Get smoothed average FPS - zero allocations!
   */
  getAverage(): number {
    if (this.count === 0) return 0
    
    let sum = 0
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i]
    }
    return Math.round(sum / this.count)
  }

  /**
   * Reset counter
   */
  reset(): void {
    this.count = 0
    this.index = 0
  }
}
