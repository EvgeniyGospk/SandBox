/**
 * SharedInputBuffer - Lock-free Ring Buffer for Mouse Input
 * 
 * Phase 5: "Telemetry" - Zero-latency input via SharedArrayBuffer
 * Phase 3 (Fort Knox): Overflow protection to prevent Bresenham artifacts
 * 
 * Instead of postMessage (async, serialization overhead), we write
 * mouse events directly to shared memory. Worker reads every frame.
 * 
 * Buffer Layout:
 * [0] = Write Head (Main Thread writes here)
 * [1] = Read Head (Worker reads here)
 * [2] = Overflow Flag (Phase 3: set when buffer overflows)
 * [3..] = Events: [x, y, type, brushSize] * INPUT_BUFFER_SIZE
 * 
 * Total size: (3 + 4 * 100) * 4 = 1612 bytes
 */

export const INPUT_BUFFER_SIZE = 100 // Max events in queue
export const EVENT_SIZE = 4 // Int32 per event: x, y, type, brushSize
const HEAD_OFFSET = 3 // First 3 slots are write/read heads + overflow flag
const OVERFLOW_INDEX = 2 // Index of overflow flag in buffer

// Input event types (matches ToolType + element encoding)
export const INPUT_TYPE_BRUSH = 0
export const INPUT_TYPE_ERASE = 1
export const INPUT_TYPE_END_STROKE = 254 // Sentinel: reset Bresenham tracking
export const INPUT_TYPE_NONE = 255 // No-op / skip
export const INPUT_TYPE_BRUSH_OFFSET = 100 // Keep brush payload distinct from erase sentinel

/**
 * Calculate required buffer size in bytes
 */
export function getInputBufferSize(): number {
  return (HEAD_OFFSET + INPUT_BUFFER_SIZE * EVENT_SIZE) * 4 // Int32 = 4 bytes
}

/**
 * Check if SharedArrayBuffer is available
 */
export function isSharedArrayBufferAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * Shared Input Buffer for Main Thread <-> Worker communication
 * 
 * Uses Atomics for thread-safe read/write without locks.
 * Lock-free SPSC (Single Producer Single Consumer) queue.
 */
export class SharedInputBuffer {
  private buffer: Int32Array
  
  constructor(sharedBuffer: SharedArrayBuffer) {
    this.buffer = new Int32Array(sharedBuffer)
    // Initialize heads and overflow flag to 0
    Atomics.store(this.buffer, 0, 0) // Write head
    Atomics.store(this.buffer, 1, 0) // Read head
    Atomics.store(this.buffer, OVERFLOW_INDEX, 0) // Overflow flag (Phase 3)
  }
  
  /**
   * Get the underlying SharedArrayBuffer for transfer to Worker
   */
  getBuffer(): SharedArrayBuffer {
    return this.buffer.buffer as SharedArrayBuffer
  }
  
  // === MAIN THREAD API ===
  
  /**
   * Push input event to buffer (called from Main Thread)
   * 
   * @param x Screen X coordinate
   * @param y Screen Y coordinate
   * @param type INPUT_TYPE_BRUSH or INPUT_TYPE_ERASE
   * @param val Brush size or element ID
   * @returns true if pushed, false if buffer full
   */
  push(x: number, y: number, type: number, val: number): boolean {
    const writeIndex = Atomics.load(this.buffer, 0)
    const readIndex = Atomics.load(this.buffer, 1)
    
    // Calculate next write position (ring buffer wrap)
    const nextWriteIndex = (writeIndex + 1) % INPUT_BUFFER_SIZE
    
    // Check if buffer is full (writer caught up to reader)
    if (nextWriteIndex === readIndex) {
      // Phase 3 (Fort Knox): Set overflow flag when buffer is full
      // This tells the Worker to reset Bresenham state
      Atomics.store(this.buffer, OVERFLOW_INDEX, 1)
      return false
    }
    
    // Write event data
    const offset = HEAD_OFFSET + writeIndex * EVENT_SIZE
    this.buffer[offset + 0] = Math.floor(x)
    this.buffer[offset + 1] = Math.floor(y)
    this.buffer[offset + 2] = type
    this.buffer[offset + 3] = Math.floor(val)
    
    // Atomically update write head (makes event visible to worker)
    Atomics.store(this.buffer, 0, nextWriteIndex)
    
    return true
  }
  
  /**
   * Push brush event
   */
  pushBrush(x: number, y: number, brushSize: number, elementId: number): boolean {
    // Encode element ID in type field (offset to avoid colliding with erase sentinel)
    return this.push(x, y, INPUT_TYPE_BRUSH_OFFSET + elementId, brushSize)
  }
  
  /**
   * Push erase event
   */
  pushErase(x: number, y: number, brushSize: number): boolean {
    return this.push(x, y, INPUT_TYPE_ERASE, brushSize)
  }
  
  /**
   * Push end-stroke sentinel (resets Bresenham tracking in worker)
   * CRITICAL: Must go through same channel as brush events to prevent race conditions!
   */
  pushEndStroke(): boolean {
    return this.push(0, 0, INPUT_TYPE_END_STROKE, 0)
  }
  
  // === WORKER THREAD API ===
  
  /**
   * Read all pending events (called from Worker Thread)
   * Returns array of events to process this frame
   */
  readAll(): Array<{ x: number; y: number; type: number; val: number }> {
    const writeIndex = Atomics.load(this.buffer, 0)
    let readIndex = Atomics.load(this.buffer, 1)
    
    const events: Array<{ x: number; y: number; type: number; val: number }> = []
    
    // Read all events between read head and write head
    while (readIndex !== writeIndex) {
      const offset = HEAD_OFFSET + readIndex * EVENT_SIZE
      
      events.push({
        x: this.buffer[offset + 0],
        y: this.buffer[offset + 1],
        type: this.buffer[offset + 2],
        val: this.buffer[offset + 3]
      })
      
      // Move to next slot (ring wrap)
      readIndex = (readIndex + 1) % INPUT_BUFFER_SIZE
    }
    
    // Atomically update read head (marks events as consumed)
    Atomics.store(this.buffer, 1, readIndex)
    
    return events
  }
  
  /**
   * Process events directly without allocation (zero-GC version)
   * Calls callback for each event
   */
  processAll(callback: (x: number, y: number, type: number, val: number) => void): number {
    const writeIndex = Atomics.load(this.buffer, 0)
    let readIndex = Atomics.load(this.buffer, 1)
    let count = 0
    
    while (readIndex !== writeIndex) {
      const offset = HEAD_OFFSET + readIndex * EVENT_SIZE
      
      callback(
        this.buffer[offset + 0],
        this.buffer[offset + 1],
        this.buffer[offset + 2],
        this.buffer[offset + 3]
      )
      
      readIndex = (readIndex + 1) % INPUT_BUFFER_SIZE
      count++
    }
    
    Atomics.store(this.buffer, 1, readIndex)
    return count
  }
  
  /**
   * Get number of pending events (for debugging)
   */
  pendingCount(): number {
    const writeIndex = Atomics.load(this.buffer, 0)
    const readIndex = Atomics.load(this.buffer, 1)
    
    if (writeIndex >= readIndex) {
      return writeIndex - readIndex
    }
    return INPUT_BUFFER_SIZE - readIndex + writeIndex
  }
  
  // === PHASE 3 (Fort Knox): Overflow Protection ===
  
  /**
   * Check if overflow occurred (buffer was full when push was attempted)
   * This should be checked by Worker before processing events.
   * If true, Worker should reset Bresenham tracking to prevent line artifacts.
   */
  checkOverflow(): boolean {
    return Atomics.load(this.buffer, OVERFLOW_INDEX) === 1
  }
  
  /**
   * Clear overflow flag (called by Worker after handling overflow)
   */
  clearOverflow(): void {
    Atomics.store(this.buffer, OVERFLOW_INDEX, 0)
  }
  
  /**
   * Check and clear overflow atomically
   * Returns true if overflow occurred (and clears the flag)
   */
  checkAndClearOverflow(): boolean {
    // Atomics.exchange returns the old value and sets the new value
    return Atomics.exchange(this.buffer, OVERFLOW_INDEX, 0) === 1
  }
}
