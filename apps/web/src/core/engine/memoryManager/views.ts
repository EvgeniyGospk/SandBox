import type { WorldPointers } from './pointers'

export type WorldViews = {
  types: Uint8Array
  colors: Uint32Array
  temperature: Float32Array
}

export function createWorldViews(memory: WebAssembly.Memory, ptrs: WorldPointers): WorldViews {
  return {
    types: new Uint8Array(memory.buffer, ptrs.typesPtr, ptrs.size),
    colors: new Uint32Array(memory.buffer, ptrs.colorsPtr, ptrs.size),
    temperature: new Float32Array(memory.buffer, ptrs.tempPtr, ptrs.size),
  }
}
