import { ChevronRight } from 'lucide-react'

export function CollapsedLeftPanel(args: { onExpand: () => void }) {
  const { onExpand } = args

  return (
    <div className="w-14 bg-[#1A1A1A] border-r border-[#333] flex flex-col items-center py-4">
      <button
        onClick={onExpand}
        className="p-2.5 hover:bg-[#252525] rounded-lg transition-colors"
        title="Expand panel"
        aria-label="Expand panel"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
