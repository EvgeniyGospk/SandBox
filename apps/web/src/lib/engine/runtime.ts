import type { WorkerBridge } from './WorkerBridge'
import type { WasmParticleEngine } from './WasmParticleEngine'

let bridge: WorkerBridge | null = null
let engine: WasmParticleEngine | null = null

export function getBridge(): WorkerBridge | null {
  return bridge
}

export function setBridge(next: WorkerBridge | null): void {
  bridge = next
}

export function getEngine(): WasmParticleEngine | null {
  return engine
}

export function setEngine(next: WasmParticleEngine | null): void {
  engine = next
}

