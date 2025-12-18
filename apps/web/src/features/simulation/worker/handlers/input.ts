import type { InputMessage } from '../types'
import { handleInput, resetInputTracking } from '../input'
import type { WorkerContext } from '../context'

export function handleInputMessage(ctx: WorkerContext, msg: InputMessage): void {
  handleInput(ctx, msg.x, msg.y, msg.radius, msg.elementId, msg.tool, msg.brushShape ?? 'circle')
}

export function handleInputEnd(ctx: WorkerContext): void {
  resetInputTracking(ctx)
}
