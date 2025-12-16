import type { ISimulationBackend, SimulationSettings } from './ISimulationBackend'
import type { RenderMode } from './types'

import type { WasmParticleEngine } from './WasmParticleEngine'
import type { WorkerBridge } from './worker/WorkerBridge'

export function createWorkerBackend(bridge: WorkerBridge): ISimulationBackend {
  return {
    play: () => bridge.play(),
    pause: () => bridge.pause(),
    step: () => bridge.step(),
    clear: () => bridge.clear(),
    setSettings: (settings: SimulationSettings) => bridge.setSettings(settings),
    setRenderMode: (mode: RenderMode) => bridge.setRenderMode(mode),
    saveSnapshot: async () => bridge.saveSnapshot(),
    loadSnapshot: (buffer: ArrayBuffer) => bridge.loadSnapshot(buffer),
  }
}

export function createWasmBackend(engine: WasmParticleEngine): ISimulationBackend {
  return {
    play: () => {
      // Main-thread backend uses the store's play-state in the RAF loop.
    },
    pause: () => {
      // Main-thread backend uses the store's play-state in the RAF loop.
    },
    step: () => engine.step(),
    clear: () => engine.clear(),
    setSettings: (settings: SimulationSettings) => {
      const { gravity, ambientTemperature } = settings
      engine.setSettings({ gravity, ambientTemperature })
    },
    setRenderMode: (mode: RenderMode) => engine.setRenderMode(mode),
    saveSnapshot: async () => {
      const snap = engine.saveSnapshot()
      if (!snap) return null
      // Ensure we always hand out an ArrayBuffer (not ArrayBufferLike) for transfer-safety.
      return (new Uint8Array(snap)).buffer as ArrayBuffer
    },
    loadSnapshot: (buffer: ArrayBuffer) => engine.loadSnapshot(new Uint8Array(buffer)),
  }
}
