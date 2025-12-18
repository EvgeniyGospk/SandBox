import type { WasmModule, WasmWorld } from './types'
import { recreateWorldFromSnapshot } from './snapshot'

export function createWorld(args: { wasm: WasmModule; width: number; height: number }): WasmWorld {
  const { wasm, width, height } = args
  const world = new wasm.World(width, height)

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
