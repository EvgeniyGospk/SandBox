import type { Element } from '@/features/simulation/domain/elements'
import type { ElementId } from '@/features/simulation/engine/api/types'
import type { ToolType } from '@/features/tools/model/toolTypes'

import { CategoryTabs } from './CategoryTabs'
import { ElementsGrid } from './ElementsGrid'
import { ElementButton } from './ElementButton'

export function ElementsPanel(args: {
  categories: Array<[string, string]>
  activeCategory: string
  onSelectCategory: (key: string) => void

  elementsInCategory: ReadonlyArray<Element>
  selectedElementId: ElementId
  selectedTool: ToolType
  onSelectElementId: (id: ElementId) => void
}) {
  const {
    categories,
    activeCategory,
    onSelectCategory,
    elementsInCategory,
    selectedElementId,
    selectedTool,
    onSelectElementId,
  } = args

  return (
    <>
      <CategoryTabs categories={categories} activeCategory={activeCategory} onSelectCategory={onSelectCategory} />

      <ElementsGrid
        items={elementsInCategory}
        renderItem={(element) => (
          <ElementButton
            key={element.id}
            element={element}
            isSelected={selectedElementId === element.id && selectedTool !== 'rigid_body'}
            onClick={() => onSelectElementId(element.id)}
          />
        )}
      />
    </>
  )
}
