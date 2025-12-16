import type { ElementType } from '../../types'
import { ELEMENT_NAME_TO_ID } from '../../data/generated_elements'
import type { WasmWorld } from '../types'
import { floodFillInPlace } from '../fill'

export function floodFill(args: {
  world: WasmWorld
  typesView: Uint8Array | null
  width: number
  height: number
  cx: number
  cy: number
  element: ElementType
}): void {
  const { world, typesView, width, height, cx, cy, element } = args
  if (!typesView) return

  const targetId = ELEMENT_NAME_TO_ID[element]
  const LIMIT = 200_000

  floodFillInPlace({
    world,
    typesView,
    width,
    height,
    startX: Math.floor(cx),
    startY: Math.floor(cy),
    targetId,
    limit: LIMIT,
  })
}
