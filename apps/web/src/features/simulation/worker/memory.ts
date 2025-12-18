import { MemoryManager } from '@/features/simulation/engine/MemoryManager'

import type { WorkerContext } from './context'

export function updateMemoryViews(ctx: WorkerContext): void {
  const state = ctx.state
  if (!state.wasm.engine || !state.wasm.memory) return

  if (!state.memory.manager || state.memory.engine !== state.wasm.engine) {
    state.memory.manager = new MemoryManager(state.wasm.memory, state.wasm.engine)
    state.memory.engine = state.wasm.engine
  } else {
    state.memory.manager.refresh()
  }
}

export function applyCurrentSettingsToEngine(ctx: WorkerContext): void {
  const state = ctx.state
  const engine = state.wasm.engine
  if (!engine) return

  if (state.settings.gravity) {
    engine.set_gravity(state.settings.gravity.x, state.settings.gravity.y)
  }
  if (state.settings.ambientTemperature !== null) {
    engine.set_ambient_temperature(state.settings.ambientTemperature)
  }
}
