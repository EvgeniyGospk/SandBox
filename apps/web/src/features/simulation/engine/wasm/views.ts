type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export type WorldMemoryViews = {
  types: Uint8Array
  colors: Uint32Array
  temperature: Float32Array
}

export function createWorldMemoryViews(world: WasmWorld, memory: WebAssembly.Memory): WorldMemoryViews {
  const typesPtr = world.types_ptr()
  const colorsPtr = world.colors_ptr()
  const tempPtr = world.temperature_ptr()
  const size = world.types_len()

  return {
    types: new Uint8Array(memory.buffer, typesPtr, size),
    colors: new Uint32Array(memory.buffer, colorsPtr, size),
    temperature: new Float32Array(memory.buffer, tempPtr, size),
  }
}
