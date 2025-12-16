import type { ElementType } from '@/core/engine'
import type { ComponentType } from 'react'

import { RigidBodyInstructions } from './RigidBodyInstructions'
import { RigidBodyMaterialSelector } from './RigidBodyMaterialSelector'
import { RigidBodyShapeSelector } from './RigidBodyShapeSelector'
import { RigidBodySizeSlider } from './RigidBodySizeSlider'

type RigidBodyShape = 'box' | 'circle'

type ShapeDef = { id: RigidBodyShape; name: string; icon: ComponentType<{ size?: number }>; description: string }

type MaterialDef = { id: ElementType; name: string; color: string }

export function RigidBodiesPanel(args: {
  shapes: ReadonlyArray<ShapeDef>
  materials: ReadonlyArray<MaterialDef>

  rigidBodyShape: RigidBodyShape
  rigidBodySize: number
  rigidBodyElement: ElementType

  selectedTool: string

  onSelectShape: (shape: RigidBodyShape) => void
  onChangeSize: (size: number) => void
  onSelectMaterial: (id: ElementType) => void
}) {
  const {
    shapes,
    materials,
    rigidBodyShape,
    rigidBodySize,
    rigidBodyElement,
    selectedTool,
    onSelectShape,
    onChangeSize,
    onSelectMaterial,
  } = args

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <RigidBodyShapeSelector
        shapes={shapes}
        rigidBodyShape={rigidBodyShape}
        selectedTool={selectedTool}
        onSelectShape={onSelectShape}
      />

      <RigidBodySizeSlider rigidBodySize={rigidBodySize} onChange={onChangeSize} />

      <RigidBodyMaterialSelector
        materials={materials}
        rigidBodyElement={rigidBodyElement}
        onSelectMaterial={onSelectMaterial}
      />

      <RigidBodyInstructions />
    </div>
  )
}
