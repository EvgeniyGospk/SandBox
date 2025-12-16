import type { RenderModeMessage } from '../types'
import { state } from '../state'

export function handleRenderMode(msg: RenderModeMessage): void {
  state.renderMode = msg.mode
  if (state.renderMode === 'normal' && state.useWebGL && state.renderer) {
    state.renderer.requestFullUpload()
  }
}
