import type { ElementType, ToolType } from '../../api/types'
import type { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'

import { postEndStroke, sendFillToWorker, sendInputToWorker } from '../bridge'

export function sendBrushInput(args: {
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
  sendInputToWorker({
    worker: args.worker,
    useSharedInput: args.useSharedInput,
    inputBuffer: args.inputBuffer,
    tool: args.tool,
    element: args.element,
    radius: args.radius,
    brushShape: args.brushShape,
    screenX: args.screenX,
    screenY: args.screenY,
    worldX: args.worldX,
    worldY: args.worldY,
  })
}

export function sendFill(args: { worker: Worker | null; worldX: number; worldY: number; element: ElementType }): void {
  sendFillToWorker({ worker: args.worker, worldX: args.worldX, worldY: args.worldY, element: args.element })
}

export function endStroke(args: {
  worker: Worker | null
  useSharedInput: boolean
  inputBuffer: SharedInputBuffer | null
}): void {
  if (args.useSharedInput && args.inputBuffer) {
    args.inputBuffer.pushEndStroke()
    return
  }

  postEndStroke(args.worker)
}
