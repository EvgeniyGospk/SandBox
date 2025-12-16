import { state } from '../state'

export function handleClear(): void {
  if (!state.engine) return
  state.engine.clear()
  state.isPlaying = false
  state.stepAccumulator = 0
}
