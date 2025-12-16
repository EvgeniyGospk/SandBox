import type { Element } from '@/features/simulation/domain/elements'

// Helper to darken/lighten color
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function ElementButton(args: {
  element: Element
  isSelected: boolean
  onClick: () => void
}) {
  const { element, isSelected, onClick } = args

  return (
    <button
      onClick={onClick}
      className={`
        aspect-square
        flex flex-col items-center justify-center 
        p-2 rounded-lg 
        transition-all duration-200 
        ${
          isSelected
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
      <span
        className={`
        text-xs mt-1.5 font-medium text-center w-full truncate
        ${isSelected ? 'text-white' : 'text-[#707070]'}
      `}
      >
        {element.name}
      </span>
    </button>
  )
}
