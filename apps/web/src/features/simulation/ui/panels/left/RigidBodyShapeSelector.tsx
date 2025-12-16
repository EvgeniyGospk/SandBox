import type { ComponentType } from 'react'

type RigidBodyShape = 'box' | 'circle'

export function RigidBodyShapeSelector(args: {
  shapes: ReadonlyArray<{ id: RigidBodyShape; name: string; icon: ComponentType<{ size?: number }>; description: string }>
  rigidBodyShape: RigidBodyShape
  selectedTool: string
  onSelectShape: (shapeId: RigidBodyShape) => void
}) {
  const { shapes, rigidBodyShape, selectedTool, onSelectShape } = args

  return (
    <div className="mb-4">
      <label className="text-xs text-[#808080] uppercase tracking-wider mb-2 block">Shape</label>
      <div className="grid grid-cols-2 gap-2">
        {shapes.map((shape) => {
          const Icon = shape.icon
          return (
            <button
              key={shape.id}
              onClick={() => onSelectShape(shape.id)}
              className={`
                        flex flex-col items-center justify-center p-3 rounded-lg transition-all
                        ${
                          rigidBodyShape === shape.id && selectedTool === 'rigid_body'
                            ? 'bg-[#8B5CF6] text-white ring-2 ring-purple-400'
                            : 'bg-[#252525] text-[#808080] hover:text-white hover:bg-[#2a2a2a]'
                        }
                      `}
              title={shape.description}
            >
              <Icon size={24} />
              <span className="text-xs mt-1">{shape.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
