import { useState } from 'react'
import { useToolStore } from '@/features/tools/model/toolStore'
import { ELEMENTS, ELEMENT_CATEGORIES } from '@/features/simulation/domain/elements'
import { CollapsedLeftPanel } from './left/CollapsedLeftPanel'
import { LeftPanelHeader } from './left/LeftPanelHeader'
import { ElementsPanel } from './left/ElementsPanel'
import { RigidBodiesPanel } from './left/RigidBodiesPanel'
import {
  RIGID_BODY_MATERIALS as RIGID_BODY_MATERIALS_DATA,
  RIGID_BODY_SHAPES as RIGID_BODY_SHAPES_DATA,
} from './left/rigidBodyData'

// Rigid body shape definitions
const RIGID_BODY_SHAPES = RIGID_BODY_SHAPES_DATA

// Materials available for rigid bodies
const RIGID_BODY_MATERIALS = RIGID_BODY_MATERIALS_DATA

const RIGID_BODIES_ENABLED = false

type PanelMode = 'elements' | 'bodies'

export function LeftPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [panelMode, setPanelMode] = useState<PanelMode>('elements')
  const [activeCategory, setActiveCategory] = useState<string>('solids')
  const { 
    selectedElement, 
    setElement,
    rigidBodyShape,
    rigidBodySize,
    rigidBodyElement,
    setRigidBodyShape,
    setRigidBodySize,
    setRigidBodyElement,
    selectedTool,
  } = useToolStore()

  const categories = Object.entries(ELEMENT_CATEGORIES)
  const elementsInCategory = ELEMENTS.filter(el => el.category === activeCategory)
  const effectivePanelMode: PanelMode = RIGID_BODIES_ENABLED ? panelMode : 'elements'

  if (isCollapsed) {
    return <CollapsedLeftPanel onExpand={() => setIsCollapsed(false)} />
  }

  return (
    <aside className="w-64 bg-[#1A1A1A] border-r border-[#333] flex flex-col">
      {/* Header with mode toggle */}
      <LeftPanelHeader
        effectivePanelMode={effectivePanelMode}
        rigidBodiesEnabled={RIGID_BODIES_ENABLED}
        onSetPanelMode={setPanelMode}
        onCollapse={() => setIsCollapsed(true)}
      />

      {effectivePanelMode === 'elements' ? (
        <>
          {/* Category Tabs */}
          {/* Elements Grid */}
          <ElementsPanel
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            elementsInCategory={elementsInCategory}
            selectedElement={selectedElement}
            selectedTool={selectedTool}
            onSelectElement={setElement}
          />
        </>
      ) : (
        <>
          {/* Rigid Bodies Panel */}
          <RigidBodiesPanel
            shapes={RIGID_BODY_SHAPES}
            materials={RIGID_BODY_MATERIALS}
            rigidBodyShape={rigidBodyShape}
            rigidBodySize={rigidBodySize}
            rigidBodyElement={rigidBodyElement}
            selectedTool={selectedTool}
            onSelectShape={setRigidBodyShape}
            onChangeSize={setRigidBodySize}
            onSelectMaterial={setRigidBodyElement}
          />
        </>
      )}
    </aside>
  )
}
