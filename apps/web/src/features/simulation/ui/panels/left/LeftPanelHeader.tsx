import { ChevronLeft } from 'lucide-react'

type PanelMode = 'elements' | 'bodies'

export function LeftPanelHeader(args: {
  effectivePanelMode: PanelMode
  rigidBodiesEnabled: boolean
  onSetPanelMode: (mode: PanelMode) => void
  onCollapse: () => void
}) {
  const { effectivePanelMode, rigidBodiesEnabled, onSetPanelMode, onCollapse } = args

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]">
      <div className="flex gap-2">
        <button
          onClick={() => onSetPanelMode('elements')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
            effectivePanelMode === 'elements' ? 'bg-[#3B82F6] text-white' : 'bg-[#252525] text-[#808080] hover:text-white'
          }`}
        >
          Elements
        </button>
        <button
          disabled={!rigidBodiesEnabled}
          onClick={() => {
            if (rigidBodiesEnabled) onSetPanelMode('bodies')
          }}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
            effectivePanelMode === 'bodies' ? 'bg-[#8B5CF6] text-white' : 'bg-[#252525] text-[#808080] hover:text-white'
          } ${!rigidBodiesEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={!rigidBodiesEnabled ? 'Rigid bodies are temporarily disabled' : undefined}
        >
          Bodies
        </button>
      </div>
      <button
        onClick={onCollapse}
        className="p-2 hover:bg-[#252525] rounded-lg transition-colors"
        title="Collapse panel"
        aria-label="Collapse panel"
      >
        <ChevronLeft size={16} />
      </button>
    </div>
  )
}
