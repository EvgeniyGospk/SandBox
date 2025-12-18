type WasmModule = typeof import('@particula/engine-wasm/particula_engine')
type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export function recreateWorldFromSnapshot(args: {
  wasm: WasmModule
  width: number
  height: number
  types: Uint8Array
}): WasmWorld {
  const { wasm, width, height, types } = args

  const world = new wasm.World(width, height)
  {
    const raw = import.meta.env.VITE_CHUNK_SLEEPING
    const str = raw === undefined ? '' : String(raw).toLowerCase().trim()
    const enabled = str === '' || (str !== '0' && str !== 'false' && str !== 'off')
    ;(world as unknown as { set_chunk_sleeping_enabled?: (enabled: boolean) => void }).set_chunk_sleeping_enabled?.(enabled)
  }

  for (let i = 0; i < types.length; i++) {
    const id = types[i]
    if (id === 0) continue
    const x = i % width
    const y = Math.floor(i / width)
    world.add_particle(x, y, id)
  }

  return world
}
