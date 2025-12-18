import type { ToolType } from '../api/types'
import type { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'

export function sendInputToWorker(args: {
  worker: Worker | null
  useSharedInput: boolean
  inputBuffer: SharedInputBuffer | null
  tool: ToolType
  elementId: number
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
    elementId,
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
      const clamped = Math.max(0, Math.min(255, Math.floor(elementId)))
      if (clamped !== 0) inputBuffer.pushBrush(worldX, worldY, radius, clamped)
    }
    return
  }

  worker?.postMessage({
    type: 'INPUT',
    x: screenX,
    y: screenY,
    radius,
    elementId,
    brushShape,
    tool,
  })
}

export function sendFillToWorker(args: {
  worker: Worker | null
  worldX: number
  worldY: number
  elementId: number
}): void {
  args.worker?.postMessage({
    type: 'FILL',
    x: args.worldX,
    y: args.worldY,
    elementId: args.elementId,
  })
}
