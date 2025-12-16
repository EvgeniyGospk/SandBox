import { state } from '../state'
import { updateMemoryViews } from '../memory'

export function handleStep(): void {
  if (!state.engine) return
  state.engine.step()
  updateMemoryViews()
}
