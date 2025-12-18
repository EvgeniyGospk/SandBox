import type { TransformMessage } from '../types'
import type { WorkerContext } from '../context'

export function handleTransform(ctx: WorkerContext, msg: TransformMessage): void {
  const prev = ctx.state.view.transform
  const zoom = Number.isFinite(msg.zoom) ? Math.max(0.05, Math.min(50, msg.zoom)) : prev.zoom
  const panX = Number.isFinite(msg.panX) ? msg.panX : prev.panX
  const panY = Number.isFinite(msg.panY) ? msg.panY : prev.panY
  ctx.state.view.transform = { zoom, panX, panY }
}
