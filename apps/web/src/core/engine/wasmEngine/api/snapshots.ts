import type { WasmModule, WasmWorld } from '../types'
import { recreateWorldFromSnapshot } from '../snapshot'

export function saveSnapshot(typesView: Uint8Array | null): Uint8Array | null {
  if (!typesView) return null
  return new Uint8Array(typesView)
}

export function loadSnapshot(args: {
  wasm: WasmModule
  width: number
  height: number
  types: Uint8Array
  warn: (message: string) => void
}): WasmWorld | null {
  const { wasm, width, height, types, warn } = args

  const expected = width * height
  if (types.length !== expected) {
    warn('Snapshot size mismatch, skipping load')
    return null
  }

  return recreateWorldFromSnapshot({ wasm, width, height, types })
}
