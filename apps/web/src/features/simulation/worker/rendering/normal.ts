import type { SimulationWorkerState } from '../state'

export function renderNormal(state: SimulationWorkerState, BG_COLOR_32: number, EL_EMPTY: number): void {
  if (!state.render.pixels32 || !state.memory.manager) return

  const typesView = state.memory.manager.types
  const colorsView = state.memory.manager.colors
  const len = Math.min(typesView.length, state.render.pixels32.length)

  state.render.pixels32.set(colorsView.subarray(0, len))

  for (let i = 0; i < len; i++) {
    if (typesView[i] === EL_EMPTY) {
      state.render.pixels32[i] = BG_COLOR_32
    }
  }
}
