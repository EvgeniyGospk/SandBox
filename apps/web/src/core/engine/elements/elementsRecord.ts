import type { ElementProperties, ElementType } from '../types'

export function buildElementsRecord(args: {
  elementData: ReadonlyArray<ElementProperties>
  elementCount: number
  idToName: ReadonlyArray<ElementType>
}): Record<ElementType, ElementProperties> {
  const { elementData, elementCount, idToName } = args

  const elements: Record<ElementType, ElementProperties> = {} as Record<ElementType, ElementProperties>

  for (let i = 0; i < elementCount; i++) {
    const name = idToName[i]
    if (name) {
      elements[name] = elementData[i]
    }
  }

  return elements
}
