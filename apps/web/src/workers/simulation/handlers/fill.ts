import type { ElementType } from '../../../core/engine/types'
import { state, ELEMENT_MAP } from '../state'
import { floodFill } from '../tools'

export function handleFill(msg: { type: 'FILL'; x: number; y: number; element: ElementType }): void {
  if (!state.engine || !state.memoryManager) return
  const elementId = ELEMENT_MAP[msg.element] ?? 0
  floodFill(msg.x, msg.y, elementId)
}
