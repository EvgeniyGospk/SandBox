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
 * Total size: (3 + 4 * 100) * 4 = 1612 bytes
 */

import { initializeSharedInputBuffer } from './shared/init'
import { pushBrushEvent, pushEndStrokeEvent, pushEraseEvent, pushEvent } from './shared/push'
import { pendingEventCount, processAllEvents, readAllEvents } from './shared/read'
import { checkAndClearOverflowFlag, checkOverflowFlag, clearOverflowFlag } from './shared/overflow'

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
    initializeSharedInputBuffer({ buffer: this.buffer, overflowIndex: OVERFLOW_INDEX })
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
    return pushEvent({
      buffer: this.buffer,
      x,
      y,
      type,
      val,
      inputBufferSize: INPUT_BUFFER_SIZE,
      eventSize: EVENT_SIZE,
      headOffset: HEAD_OFFSET,
      overflowIndex: OVERFLOW_INDEX,
    })
  }
  
  /**
   * Push brush event
   */
  pushBrush(x: number, y: number, brushSize: number, elementId: number): boolean {
    // Encode element ID in type field (offset to avoid colliding with erase sentinel)
    return pushBrushEvent({
      buffer: this.buffer,
      x,
      y,
      brushSize,
      elementId,
      inputTypeBrushOffset: INPUT_TYPE_BRUSH_OFFSET,
      inputBufferSize: INPUT_BUFFER_SIZE,
      eventSize: EVENT_SIZE,
      headOffset: HEAD_OFFSET,
      overflowIndex: OVERFLOW_INDEX,
    })
  }
  
  /**
   * Push erase event
   */
  pushErase(x: number, y: number, brushSize: number): boolean {
    return pushEraseEvent({
      buffer: this.buffer,
      x,
      y,
      brushSize,
      inputTypeErase: INPUT_TYPE_ERASE,
      inputBufferSize: INPUT_BUFFER_SIZE,
      eventSize: EVENT_SIZE,
      headOffset: HEAD_OFFSET,
      overflowIndex: OVERFLOW_INDEX,
    })
  }
  
  /**
   * Push end-stroke sentinel (resets Bresenham tracking in worker)
   * CRITICAL: Must go through same channel as brush events to prevent race conditions!
   */
  pushEndStroke(): boolean {
    return pushEndStrokeEvent({
      buffer: this.buffer,
      inputTypeEndStroke: INPUT_TYPE_END_STROKE,
      inputBufferSize: INPUT_BUFFER_SIZE,
      eventSize: EVENT_SIZE,
      headOffset: HEAD_OFFSET,
      overflowIndex: OVERFLOW_INDEX,
    })
  }
  
  // === WORKER THREAD API ===
  
  /**
   * Read all pending events (called from Worker Thread)
   * Returns array of events to process this frame
   */
  readAll(): Array<{ x: number; y: number; type: number; val: number }> {
    return readAllEvents({
      buffer: this.buffer,
      inputBufferSize: INPUT_BUFFER_SIZE,
      eventSize: EVENT_SIZE,
      headOffset: HEAD_OFFSET,
    })
  }
  
  /**
   * Process events directly without allocation (zero-GC version)
   * Calls callback for each event
   */
  processAll(callback: (x: number, y: number, type: number, val: number) => void): number {
    return processAllEvents({
      buffer: this.buffer,
      inputBufferSize: INPUT_BUFFER_SIZE,
      eventSize: EVENT_SIZE,
      headOffset: HEAD_OFFSET,
      callback,
    })
  }
  
  /**
   * Get number of pending events (for debugging)
   */
  pendingCount(): number {
    return pendingEventCount({ buffer: this.buffer, inputBufferSize: INPUT_BUFFER_SIZE })
  }
  
  // === PHASE 3 (Fort Knox): Overflow Protection ===
  
  /**
   * Check if overflow occurred (buffer was full when push was attempted)
   * This should be checked by Worker before processing events.
   * If true, Worker should reset Bresenham tracking to prevent line artifacts.
   */
  checkOverflow(): boolean {
    return checkOverflowFlag({ buffer: this.buffer, overflowIndex: OVERFLOW_INDEX })
  }
  
  /**
   * Clear overflow flag (called by Worker after handling overflow)
   */
  clearOverflow(): void {
    clearOverflowFlag({ buffer: this.buffer, overflowIndex: OVERFLOW_INDEX })
  }
  
  /**
   * Check and clear overflow atomically
   * Returns true if overflow occurred (and clears the flag)
   */
  checkAndClearOverflow(): boolean {
    // Atomics.exchange returns the old value and sets the new value
    return checkAndClearOverflowFlag({ buffer: this.buffer, overflowIndex: OVERFLOW_INDEX })
  }
}
