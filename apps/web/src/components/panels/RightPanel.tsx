import { useState } from 'react'
import { useSimulationStore, WORLD_SIZE_PRESETS, type WorldSizePreset } from '@/stores/simulationStore'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WORLD_SIZE_LABELS: Record<WorldSizePreset, string> = {
  tiny: 'Tiny (256×192)',
  small: 'Small (512×384)',
  medium: 'Medium (768×576)',
  large: 'Large (1024×768)',
  full: 'Full (Viewport)',
}

export function RightPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { 
    gravity, 
    ambientTemperature, 
    worldSizePreset,
    setGravity, 
    setAmbientTemperature,
    setWorldSizePreset,
  } = useSimulationStore()

  if (isCollapsed) {
    return (
      <div className="w-12 bg-[#1A1A1A] border-l border-[#333] flex flex-col items-center py-3">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 hover:bg-[#252525] rounded transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    )
  }

  return (
    <aside className="w-64 bg-[#1A1A1A] border-l border-[#333] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]">
        <span className="text-base font-semibold">Settings</span>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 hover:bg-[#252525] rounded transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Settings */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* World Size */}
        <div className="space-y-2">
          <label className="text-sm text-[#A0A0A0] font-medium">World Size</label>
          <select
            value={worldSizePreset}
            onChange={(e) => setWorldSizePreset(e.target.value as WorldSizePreset)}
            className="w-full px-3 py-2 bg-[#252525] border border-[#333] rounded-lg
                       text-sm text-white focus:outline-none focus:border-[#3B82F6]
                       cursor-pointer"
          >
            {(Object.keys(WORLD_SIZE_PRESETS) as WorldSizePreset[]).map((preset) => (
              <option key={preset} value={preset}>
                {WORLD_SIZE_LABELS[preset]}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#666]">
            Smaller world = more FPS. Clears simulation.
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#333]" />

        {/* Gravity */}
        <div className="space-y-2">
          <label className="text-sm text-[#A0A0A0] font-medium">Gravity</label>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#A0A0A0] w-5">X:</span>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={gravity.x}
                onChange={(e) => setGravity({ ...gravity, x: Number(e.target.value) })}
                className="flex-1 h-1.5 bg-[#333] rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none
                           [&::-webkit-slider-thumb]:w-4
                           [&::-webkit-slider-thumb]:h-4
                           [&::-webkit-slider-thumb]:bg-[#3B82F6]
                           [&::-webkit-slider-thumb]:rounded-full"
              />
              <span className="text-xs font-mono w-10 text-right">{gravity.x.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#A0A0A0] w-5">Y:</span>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={gravity.y}
                onChange={(e) => setGravity({ ...gravity, y: Number(e.target.value) })}
                className="flex-1 h-1.5 bg-[#333] rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none
                           [&::-webkit-slider-thumb]:w-4
                           [&::-webkit-slider-thumb]:h-4
                           [&::-webkit-slider-thumb]:bg-[#3B82F6]
                           [&::-webkit-slider-thumb]:rounded-full"
              />
              <span className="text-xs font-mono w-10 text-right">{gravity.y.toFixed(1)}</span>
            </div>
          </div>
          
          {/* Gravity Presets */}
          <div className="flex gap-1">
            <PresetButton 
              label="Earth" 
              onClick={() => setGravity({ x: 0, y: 9.8 })} 
            />
            <PresetButton 
              label="Moon" 
              onClick={() => setGravity({ x: 0, y: 1.6 })} 
            />
            <PresetButton 
              label="None" 
              onClick={() => setGravity({ x: 0, y: 0 })} 
            />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#333]" />

        {/* Ambient Temperature */}
        <div className="space-y-2">
          <label className="text-sm text-[#A0A0A0] font-medium">
            Ambient Temperature
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-50}
              max={100}
              value={ambientTemperature}
              onChange={(e) => setAmbientTemperature(Number(e.target.value))}
              className="flex-1 h-1.5 bg-[#333] rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none
                         [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4
                         [&::-webkit-slider-thumb]:bg-[#3B82F6]
                         [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs font-mono w-12 text-right">{ambientTemperature}°C</span>
          </div>
          
          {/* Temperature Presets */}
          <div className="flex gap-1">
            <PresetButton 
              label="Cold" 
              onClick={() => setAmbientTemperature(-20)} 
            />
            <PresetButton 
              label="Normal" 
              onClick={() => setAmbientTemperature(20)} 
            />
            <PresetButton 
              label="Hot" 
              onClick={() => setAmbientTemperature(50)} 
            />
          </div>
        </div>
      </div>
    </aside>
  )
}

interface PresetButtonProps {
  label: string
  onClick: () => void
}

function PresetButton({ label, onClick }: PresetButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-2 py-1.5 text-xs bg-[#252525] rounded-lg
                 text-[#A0A0A0] hover:text-white transition-colors"
    >
      {label}
    </button>
  )
}
