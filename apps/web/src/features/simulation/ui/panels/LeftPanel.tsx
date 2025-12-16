import { useState } from 'react'
import { useToolStore } from '@/features/tools/model/toolStore'
import { ELEMENTS, ELEMENT_CATEGORIES } from '@/features/simulation/domain/elements'
import type { ElementType } from '@/core/engine'
import { ChevronLeft, ChevronRight, Square, Circle } from 'lucide-react'

const RIGID_BODIES_ENABLED = false

// Rigid body shape definitions
const RIGID_BODY_SHAPES = [
  { id: 'box', name: 'Box', icon: Square, description: 'Rectangular rigid body' },
  { id: 'circle', name: 'Ball', icon: Circle, description: 'Circular rigid body' },
] as const

// Materials available for rigid bodies
const RIGID_BODY_MATERIALS = [
  { id: 'stone', name: 'Stone', color: '#808080' },
  { id: 'metal', name: 'Metal', color: '#A9A9A9' },
  { id: 'wood', name: 'Wood', color: '#8B4513' },
  { id: 'ice', name: 'Ice', color: '#A5F2F3' },
] as const satisfies ReadonlyArray<{ id: ElementType; name: string; color: string }>

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
    return (
      <div className="w-14 bg-[#1A1A1A] border-r border-[#333] flex flex-col items-center py-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2.5 hover:bg-[#252525] rounded-lg transition-colors"
          title="Expand panel"
          aria-label="Expand panel"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  return (
    <aside className="w-64 bg-[#1A1A1A] border-r border-[#333] flex flex-col">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]">
        <div className="flex gap-2">
          <button
            onClick={() => setPanelMode('elements')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              effectivePanelMode === 'elements'
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[#252525] text-[#808080] hover:text-white'
            }`}
          >
            Elements
          </button>
          <button
            disabled={!RIGID_BODIES_ENABLED}
            onClick={() => { if (RIGID_BODIES_ENABLED) setPanelMode('bodies') }}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
              effectivePanelMode === 'bodies'
                ? 'bg-[#8B5CF6] text-white'
                : 'bg-[#252525] text-[#808080] hover:text-white'
            } ${!RIGID_BODIES_ENABLED ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!RIGID_BODIES_ENABLED ? 'Rigid bodies are temporarily disabled' : undefined}
          >
            Bodies
          </button>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-2 hover:bg-[#252525] rounded-lg transition-colors"
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {effectivePanelMode === 'elements' ? (
        <>
          {/* Category Tabs */}
          <div className="px-4 py-3 border-b border-[#333]">
            <div
              className="flex gap-2 overflow-x-auto scrollbar-hide"
              onWheel={(e) => {
                e.currentTarget.scrollLeft += e.deltaY
              }}
            >
              {categories.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                    activeCategory === key
                      ? 'bg-[#3B82F6] text-white shadow-lg shadow-blue-500/20'
                      : 'bg-[#252525] text-[#808080] hover:text-white hover:bg-[#2a2a2a]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Elements Grid */}
          <div
            className="flex-1 overflow-y-auto p-3"
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              {elementsInCategory.map((element) => (
                <ElementButton
                  key={element.id}
                  element={element}
                  isSelected={selectedElement === element.id && selectedTool !== 'rigid_body'}
                  onClick={() => setElement(element.id)}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Rigid Bodies Panel */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Shape Selection */}
            <div className="mb-4">
              <label className="text-xs text-[#808080] uppercase tracking-wider mb-2 block">Shape</label>
              <div className="grid grid-cols-2 gap-2">
                {RIGID_BODY_SHAPES.map((shape) => {
                  const Icon = shape.icon
                  return (
                    <button
                      key={shape.id}
                      onClick={() => setRigidBodyShape(shape.id)}
                      className={`
                        flex flex-col items-center justify-center p-3 rounded-lg transition-all
                        ${rigidBodyShape === shape.id && selectedTool === 'rigid_body'
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

            {/* Size Slider */}
            <div className="mb-4">
              <label className="text-xs text-[#808080] uppercase tracking-wider mb-2 block">
                Size: {rigidBodySize}px
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={rigidBodySize}
                onChange={(e) => setRigidBodySize(parseInt(e.target.value))}
                className="w-full h-2 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-[#8B5CF6]"
              />
            </div>

            {/* Material Selection */}
            <div className="mb-4">
              <label className="text-xs text-[#808080] uppercase tracking-wider mb-2 block">Material</label>
              <div className="grid grid-cols-2 gap-2">
                {RIGID_BODY_MATERIALS.map((material) => (
                  <button
                    key={material.id}
                    onClick={() => setRigidBodyElement(material.id)}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg transition-all
                      ${rigidBodyElement === material.id
                        ? 'bg-[#252525] ring-2 ring-[#8B5CF6]'
                        : 'bg-[#1f1f1f] hover:bg-[#252525]'
                      }
                    `}
                  >
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: material.color }}
                    />
                    <span className="text-xs">{material.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-4 p-3 bg-[#252525] rounded-lg">
              <p className="text-xs text-[#808080]">
                Rigid bodies are temporarily disabled (engine stub).
              </p>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}

interface ElementButtonProps {
  element: typeof ELEMENTS[0]
  isSelected: boolean
  onClick: () => void
}

function ElementButton({ element, isSelected, onClick }: ElementButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        aspect-square
        flex flex-col items-center justify-center 
        p-2 rounded-lg 
        transition-all duration-200 
        ${isSelected
          ? 'bg-[#252525] ring-2 ring-[#3B82F6] shadow-lg shadow-blue-500/20'
          : 'bg-[#1f1f1f] hover:bg-[#252525]'
        }
      `}
      title={`${element.name}: ${element.description}`}
    >
      {/* Element Color Box */}
      <div
        className="w-10 h-10 rounded-lg shadow-md flex-shrink-0"
        style={{
          background: `linear-gradient(145deg, ${element.color}, ${adjustColor(element.color, -30)})`,
          boxShadow: isSelected 
            ? `0 0 12px ${element.color}50, inset 0 1px 0 ${adjustColor(element.color, 50)}40` 
            : `inset 0 1px 0 ${adjustColor(element.color, 50)}30`,
        }}
      />
      
      {/* Element Name */}
      <span className={`
        text-xs mt-1.5 font-medium text-center w-full truncate
        ${isSelected ? 'text-white' : 'text-[#707070]'}
      `}>
        {element.name}
      </span>
    </button>
  )
}

// Helper to darken/lighten color
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
