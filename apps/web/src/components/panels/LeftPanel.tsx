import { useState } from 'react'
import { useToolStore } from '@/stores/toolStore'
import { ELEMENTS, ELEMENT_CATEGORIES } from '@/lib/elements'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function LeftPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('solids')
  const { selectedElement, setElement } = useToolStore()

  const categories = Object.entries(ELEMENT_CATEGORIES)
  const elementsInCategory = ELEMENTS.filter(el => el.category === activeCategory)

  if (isCollapsed) {
    return (
      <div className="w-14 bg-[#1A1A1A] border-r border-[#333] flex flex-col items-center py-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2.5 hover:bg-[#252525] rounded-lg transition-colors"
          title="Expand panel"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    )
  }

  return (
    <aside className="w-64 bg-[#1A1A1A] border-r border-[#333] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]">
        <span className="text-lg font-semibold">Elements</span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-2 hover:bg-[#252525] rounded-lg transition-colors"
          title="Collapse panel"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Category Tabs */}
      <div className="px-4 py-3 border-b border-[#333]">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
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
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2">
          {elementsInCategory.map((element) => (
            <ElementButton
              key={element.id}
              element={element}
              isSelected={selectedElement === element.id}
              onClick={() => setElement(element.id)}
            />
          ))}
        </div>
      </div>
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
