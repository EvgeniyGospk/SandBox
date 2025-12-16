import type { ElementType, ToolType } from '../types'

import { ELEMENT_NAME_TO_ID } from '../data/generated_elements'
import type { SharedInputBuffer } from '../../InputBuffer'

export function sendInputToWorker(args: {
  worker: Worker | null
  useSharedInput: boolean
  inputBuffer: SharedInputBuffer | null
  tool: ToolType
  element: ElementType
  radius: number
  brushShape: 'circle' | 'square' | 'line'
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}): void {
  const {
    worker,
    useSharedInput,
    inputBuffer,
    tool,
    element,
    radius,
    brushShape,
    screenX,
    screenY,
    worldX,
    worldY,
  } = args

  if (useSharedInput && inputBuffer) {
    if (tool === 'eraser') {
      inputBuffer.pushErase(worldX, worldY, radius)
    } else if (tool === 'brush') {
      const elementId = ELEMENT_NAME_TO_ID[element] ?? 0
      if (elementId !== 0) {
        inputBuffer.pushBrush(worldX, worldY, radius, elementId)
      }
    }
    return
  }

  worker?.postMessage({
    type: 'INPUT',
    x: screenX,
    y: screenY,
    radius,
    element,
    brushShape,
    tool,
  })
}

export function sendFillToWorker(args: {
  worker: Worker | null
  worldX: number
  worldY: number
  element: ElementType
}): void {
  args.worker?.postMessage({
    type: 'FILL',
    x: args.worldX,
    y: args.worldY,
    element: args.element,
  })
}
