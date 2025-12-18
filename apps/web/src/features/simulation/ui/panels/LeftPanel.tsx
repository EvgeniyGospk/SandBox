import { useEffect, useMemo, useState } from 'react'
import { useToolStore } from '@/features/tools/model/toolStore'
import { ELEMENTS, ELEMENT_CATEGORIES } from '@/features/simulation/domain/elements'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'
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

function colorNumberToHex(color: number): string {
  const rrggbb = (color & 0xffffff).toString(16).padStart(6, '0')
  return `#${rrggbb.toUpperCase()}`
}

function titleCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function LeftPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [panelMode, setPanelMode] = useState<PanelMode>('elements')
  const [activeCategory, setActiveCategory] = useState<string>('solids')
  const contentManifest = useSimulationStore((s) => s.contentManifest)
  const { 
    selectedElementId, 
    setElementId,
    rigidBodyShape,
    rigidBodySize,
    rigidBodyElementId,
    setRigidBodyShape,
    setRigidBodySize,
    setRigidBodyElementId,
    selectedTool,
  } = useToolStore()

  const { categories, elements } = useMemo(() => {
    if (!contentManifest) {
      return {
        categories: Object.entries(ELEMENT_CATEGORIES),
        elements: ELEMENTS,
      }
    }

    const outElements = contentManifest.elements
      .filter((e) => !e.hidden && !e.ui?.hidden)
      .filter((e) => !!e.ui)
      .filter((e) => typeof e.name === 'string' && e.name.length > 0)
      .map((e) => {
        const ui = e.ui!
        return {
          id: e.id as unknown as import('@/features/simulation/engine/api/types').ElementId,
          name: ui.displayName || e.name!,
          category: ui.category,
          color: colorNumberToHex(e.color),
          description: ui.description || '',
          _sort: ui.sort ?? 0,
        }
      })
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category)
        return a._sort - b._sort
      })

    const catKeys = Array.from(new Set(outElements.map((e) => e.category)))
    const outCategories = catKeys
      .sort((a, b) => a.localeCompare(b))
      .map((k) => [k, titleCase(k)] as [string, string])

    return {
      categories: outCategories,
      elements: outElements.map(({ _sort, ...rest }) => rest),
    }
  }, [contentManifest])

  useEffect(() => {
    if (categories.length === 0) return
    const exists = categories.some(([k]) => k === activeCategory)
    if (!exists) setActiveCategory(categories[0][0])
  }, [activeCategory, categories])

  const elementsInCategory = elements.filter((el) => el.category === activeCategory)
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
            selectedElementId={selectedElementId}
            selectedTool={selectedTool}
            onSelectElementId={setElementId}
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
            rigidBodyElement={rigidBodyElementId}
            selectedTool={selectedTool}
            onSelectShape={setRigidBodyShape}
            onChangeSize={setRigidBodySize}
            onSelectMaterial={setRigidBodyElementId}
          />
        </>
      )}
    </aside>
  )
}
