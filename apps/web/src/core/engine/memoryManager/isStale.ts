type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export type MemoryTracking = {
  lastByteLength: number
  lastTypesPtr: number
  lastColorsPtr: number
  lastTempPtr: number
}

export function isStale(args: { memory: WebAssembly.Memory; engine: WasmWorld; tracking: MemoryTracking }): boolean {
  const { memory, engine, tracking } = args

  try {
    const currentLength = memory.buffer.byteLength
    if (currentLength !== tracking.lastByteLength) {
      return true
    }

    const typesPtr = engine.types_ptr()
    const colorsPtr = engine.colors_ptr()
    const tempPtr = engine.temperature_ptr()

    if (
      typesPtr !== tracking.lastTypesPtr ||
      colorsPtr !== tracking.lastColorsPtr ||
      tempPtr !== tracking.lastTempPtr
    ) {
      return true
    }

    return false
  } catch {
    return true
  }
}
