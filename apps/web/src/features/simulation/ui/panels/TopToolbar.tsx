import { useToolStore } from '@/features/tools/model/toolStore'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'
import { resetCamera } from '@/features/simulation/ui/canvas/canvasControls'
import { 
  Circle, 
  Square, 
  Minus, 
  Eraser, 
  Pipette, 
  PaintBucket,
  Hand,
  Focus,
  Undo,
  Redo,
  Save,
  FolderOpen,
  Thermometer
} from 'lucide-react'

export function TopToolbar() {
  const { 
    selectedTool, 
    brushShape, 
    brushSize, 
    setTool, 
    setBrushShape, 
    setBrushSize 
  } = useToolStore()
  
  const { renderMode, toggleRenderMode, undo, redo, saveSnapshot, loadSnapshot } = useSimulationStore()

  return (
    <header className="h-14 bg-[#1A1A1A] border-b border-[#333] flex items-center px-4 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 bg-gradient-to-br from-[#3B82F6] to-purple-500 rounded" />
        <span className="font-semibold text-base">Particula</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Brush Shapes */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Circle size={16} />}
          isActive={brushShape === 'circle'}
          onClick={() => setBrushShape('circle')}
          tooltip="Circle Brush"
        />
        <ToolButton
          icon={<Square size={16} />}
          isActive={brushShape === 'square'}
          onClick={() => setBrushShape('square')}
          tooltip="Square Brush"
        />
        <ToolButton
          icon={<Minus size={16} />}
          isActive={brushShape === 'line'}
          onClick={() => setBrushShape('line')}
          tooltip="Line Tool"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Brush Size */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#A0A0A0]">Size:</span>
        <input
          type="range"
          min={1}
          max={50}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-28 h-1.5 bg-[#333] rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:bg-[#3B82F6]
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span className="text-sm text-[#A0A0A0] w-8 font-mono">{brushSize}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Eraser size={16} />}
          isActive={selectedTool === 'eraser'}
          onClick={() => setTool('eraser')}
          tooltip="Eraser"
        />
        <ToolButton
          icon={<Hand size={16} />}
          isActive={selectedTool === 'move'}
          onClick={() => setTool('move')}
          tooltip="Move / Pan (Middle Mouse)"
        />
        <ToolButton
          icon={<Pipette size={16} />}
          isActive={selectedTool === 'pipette'}
          onClick={() => setTool('pipette')}
          tooltip="Pipette"
        />
        <ToolButton
          icon={<PaintBucket size={16} />}
          isActive={selectedTool === 'fill'}
          onClick={() => setTool('fill')}
          tooltip="Fill"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* View Controls */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Thermometer size={16} />}
          isActive={renderMode === 'thermal'}
          onClick={toggleRenderMode}
          tooltip={renderMode === 'thermal' ? 'Normal View' : 'Thermal Vision'}
        />
        <ToolButton
          icon={<Focus size={16} />}
          onClick={resetCamera}
          tooltip="Reset View (1:1)"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Undo size={16} />}
          onClick={undo}
          tooltip="Undo"
        />
        <ToolButton
          icon={<Redo size={16} />}
          onClick={redo}
          tooltip="Redo"
        />
        <div className="w-px h-6 bg-border mx-1" />
        <ToolButton
          icon={<Save size={16} />}
          onClick={saveSnapshot}
          tooltip="Save"
        />
        <ToolButton
          icon={<FolderOpen size={16} />}
          onClick={loadSnapshot}
          tooltip="Load"
        />
      </div>
    </header>
  )
}

interface ToolButtonProps {
  icon: React.ReactNode
  isActive?: boolean
  onClick: () => void
  tooltip: string
}

function ToolButton({ icon, isActive, onClick, tooltip }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      className={`p-2.5 rounded-lg transition-colors ${
        isActive
          ? 'bg-[#3B82F6] text-white'
          : 'hover:bg-[#252525] text-[#A0A0A0] hover:text-white'
      }`}
    >
      {icon}
    </button>
  )
}
