import type { CategoryId, ElementId, ElementProperties } from '../api/types'

export function getElementFromData(args: {
  elementData: ReadonlyArray<ElementProperties>
  id: ElementId
  emptyId: ElementId
}): ElementProperties {
  const { elementData, id, emptyId } = args
  return elementData[id] || elementData[emptyId]
}

export function getCategoryIdFromData(args: {
  elementData: ReadonlyArray<ElementProperties>
  id: ElementId
  defaultCategory: CategoryId
}): CategoryId {
  const { elementData, id, defaultCategory } = args
  return elementData[id]?.category ?? defaultCategory
}

export function getDensityFromData(args: { elementData: ReadonlyArray<ElementProperties>; id: ElementId }): number {
  const { elementData, id } = args
  return elementData[id]?.density ?? 0
}

export function getDispersionFromData(args: { elementData: ReadonlyArray<ElementProperties>; id: ElementId }): number {
  const { elementData, id } = args
  return elementData[id]?.dispersion ?? 0
}
