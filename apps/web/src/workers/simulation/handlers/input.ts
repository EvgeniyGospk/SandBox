import type { InputMessage } from '../types'
import { handleInput, resetInputTracking } from '../input'

export function handleInputMessage(msg: InputMessage): void {
  handleInput(msg.x, msg.y, msg.radius, msg.element, msg.tool, msg.brushShape ?? 'circle')
}

export function handleInputEnd(): void {
  resetInputTracking()
}
