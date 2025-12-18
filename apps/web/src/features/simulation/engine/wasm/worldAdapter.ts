import type { WasmModule, WasmWorld } from './types'
import { recreateWorldFromSnapshot } from './snapshot'

export function createWorld(args: { wasm: WasmModule; width: number; height: number }): WasmWorld {
  const { wasm, width, height } = args
  const world = new wasm.World(width, height)

  const raw = import.meta.env.VITE_CHUNK_SLEEPING
  const str = raw === undefined ? '' : String(raw).toLowerCase().trim()
  const enabled = str === '' || (str !== '0' && str !== 'false' && str !== 'off')
  ;(world as unknown as { set_chunk_sleeping_enabled?: (enabled: boolean) => void }).set_chunk_sleeping_enabled?.(enabled)

  return world
}

export function recreateWorld(args: {
  wasm: WasmModule
  width: number
  height: number
  types: Uint8Array
}): WasmWorld {
  return recreateWorldFromSnapshot(args)
}
