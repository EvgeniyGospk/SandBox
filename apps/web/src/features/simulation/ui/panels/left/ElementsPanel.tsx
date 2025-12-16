import type { Element } from '@/features/simulation/domain/elements'
import type { ElementType } from '@/features/simulation/engine'
import type { ToolType } from '@/features/tools/model/toolTypes'

import { CategoryTabs } from './CategoryTabs'
import { ElementsGrid } from './ElementsGrid'
import { ElementButton } from './ElementButton'

export function ElementsPanel(args: {
  categories: Array<[string, string]>
  activeCategory: string
  onSelectCategory: (key: string) => void

  elementsInCategory: ReadonlyArray<Element>
  selectedElement: ElementType
  selectedTool: ToolType
  onSelectElement: (id: ElementType) => void
}) {
  const {
    categories,
    activeCategory,
    onSelectCategory,
    elementsInCategory,
    selectedElement,
    selectedTool,
    onSelectElement,
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
            isSelected={selectedElement === element.id && selectedTool !== 'rigid_body'}
            onClick={() => onSelectElement(element.id)}
          />
        )}
      />
    </>
  )
}
