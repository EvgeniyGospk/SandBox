import { state } from '../state'

export function handlePlay(): void {
  state.isPlaying = true
}

export function handlePause(): void {
  state.isPlaying = false
  state.stepAccumulator = 0
}
