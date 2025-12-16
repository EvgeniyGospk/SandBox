import type { WorldPointers } from './pointers'
import type { MemoryTracking } from './isStale'

export function updateTracking(args: { memory: WebAssembly.Memory; pointers: WorldPointers }): MemoryTracking {
  const { memory, pointers } = args

  return {
    lastByteLength: memory.buffer.byteLength,
    lastTypesPtr: pointers.typesPtr,
    lastColorsPtr: pointers.colorsPtr,
    lastTempPtr: pointers.tempPtr,
  }
}
