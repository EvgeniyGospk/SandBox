import type { ElementId, ElementProperties } from '../api/types'
import { precomputeColorVariationsById } from './colorVariations'

export function createColorByIdGetter(args: {
  elementData: ReadonlyArray<ElementProperties>
  elementCount: number
}): (id: ElementId, seed: number) => number {
  const { elementData, elementCount } = args

  const variationsById = precomputeColorVariationsById({
    elementCount,
    getBaseColorById: (id) => elementData[id].color,
  })

  return (id: ElementId, seed: number): number => {
    return variationsById[id][seed & 31]
  }
}
