import { MemoryManager } from '@/features/simulation/engine/MemoryManager'

import { state } from './state'

export function updateMemoryViews(): void {
  if (!state.engine || !state.wasmMemory) return

  if (!state.memoryManager || state.memoryManagerEngine !== state.engine) {
    state.memoryManager = new MemoryManager(state.wasmMemory, state.engine)
    state.memoryManagerEngine = state.engine
  } else {
    state.memoryManager.refresh()
  }
}

export function applyCurrentSettingsToEngine(): void {
  const engine = state.engine
  if (!engine) return

  if (state.currentGravity) {
    engine.set_gravity(state.currentGravity.x, state.currentGravity.y)
  }
  if (state.currentAmbientTemperature !== null) {
    engine.set_ambient_temperature(state.currentAmbientTemperature)
  }
}
