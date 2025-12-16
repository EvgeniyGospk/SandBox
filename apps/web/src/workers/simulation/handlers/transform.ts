import type { TransformMessage } from '../types'
import { state } from '../state'

export function handleTransform(msg: TransformMessage): void {
  state.zoom = Number.isFinite(msg.zoom) ? Math.max(0.05, Math.min(50, msg.zoom)) : state.zoom
  state.panX = Number.isFinite(msg.panX) ? msg.panX : state.panX
  state.panY = Number.isFinite(msg.panY) ? msg.panY : state.panY
}
