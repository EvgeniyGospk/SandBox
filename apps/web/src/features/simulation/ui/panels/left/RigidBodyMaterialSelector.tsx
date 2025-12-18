import type { ElementId } from '@/features/simulation/engine/api/types'

export function RigidBodyMaterialSelector(args: {
  materials: ReadonlyArray<{ id: ElementId; name: string; color: string }>
  rigidBodyElement: ElementId
  onSelectMaterial: (id: ElementId) => void
}) {
  const { materials, rigidBodyElement, onSelectMaterial } = args

  return (
    <div className="mb-4">
      <label className="text-xs text-[#808080] uppercase tracking-wider mb-2 block">Material</label>
      <div className="grid grid-cols-2 gap-2">
        {materials.map((material) => (
          <button
            key={material.id}
            onClick={() => onSelectMaterial(material.id)}
            className={`
                      flex items-center gap-2 p-2 rounded-lg transition-all
                      ${
                        rigidBodyElement === material.id
                          ? 'bg-[#252525] ring-2 ring-[#8B5CF6]'
                          : 'bg-[#1f1f1f] hover:bg-[#252525]'
                      }
                    `}
          >
            <div className="w-6 h-6 rounded" style={{ backgroundColor: material.color }} />
            <span className="text-xs">{material.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
