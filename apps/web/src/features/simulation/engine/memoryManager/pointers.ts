type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export type WorldPointers = {
  size: number
  typesPtr: number
  colorsPtr: number
  tempPtr: number
}

export function readWorldPointers(engine: WasmWorld): WorldPointers {
  const size = engine.types_len()
  const typesPtr = engine.types_ptr()
  const colorsPtr = engine.colors_ptr()
  const tempPtr = engine.temperature_ptr()

  return { size, typesPtr, colorsPtr, tempPtr }
}
