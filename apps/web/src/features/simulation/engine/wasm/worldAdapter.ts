import type { WasmModule, WasmWorld } from './types'
import { recreateWorldFromSnapshot } from './snapshot'

export function createWorld(args: { wasm: WasmModule; width: number; height: number }): WasmWorld {
  const { wasm, width, height } = args
  return new wasm.World(width, height)
}

export function recreateWorld(args: {
  wasm: WasmModule
  width: number
  height: number
  types: Uint8Array
}): WasmWorld {
  return recreateWorldFromSnapshot(args)
}
