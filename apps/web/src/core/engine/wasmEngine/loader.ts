import { debugLog, logError } from '../../logging/log'

type WasmModule = typeof import('@particula/engine-wasm/particula_engine')
type WasmInitOutput = import('@particula/engine-wasm/particula_engine').InitOutput

let wasmModule: WasmModule | null = null
let wasmMemory: WebAssembly.Memory | null = null

export async function loadWasmEngine(): Promise<WasmModule> {
  if (wasmModule) return wasmModule

  try {
    const wasm = await import('@particula/engine-wasm/particula_engine')
    const wasmExports: WasmInitOutput = await wasm.default()

    wasmMemory = wasmExports.memory

    if (!wasmMemory) {
      logError('WASM memory not found in exports:', Object.keys(wasmExports))
      throw new Error('WASM memory not available')
    }

    wasmModule = wasm
    wasmModule.init()

    debugLog(`🦀 WASM Engine loaded, version: ${wasmModule.version()}`)
    debugLog(`🦀 WASM memory size: ${wasmMemory.buffer.byteLength} bytes`)
    return wasmModule
  } catch (err) {
    logError('Failed to load WASM engine:', err)
    throw err
  }
}

export function isWasmAvailable(): boolean {
  return typeof WebAssembly !== 'undefined'
}

export function getWasmMemory(): WebAssembly.Memory | null {
  return wasmMemory
}
