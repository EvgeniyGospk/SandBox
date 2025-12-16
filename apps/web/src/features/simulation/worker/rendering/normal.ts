import type { SimulationWorkerState } from '../state'

export function renderNormal(state: SimulationWorkerState, BG_COLOR_32: number, EL_EMPTY: number): void {
  if (!state.pixels32 || !state.memoryManager) return

  const typesView = state.memoryManager.types
  const colorsView = state.memoryManager.colors
  const len = Math.min(typesView.length, state.pixels32.length)

  state.pixels32.set(colorsView.subarray(0, len))

  for (let i = 0; i < len; i++) {
    if (typesView[i] === EL_EMPTY) {
      state.pixels32[i] = BG_COLOR_32
    }
  }
}
