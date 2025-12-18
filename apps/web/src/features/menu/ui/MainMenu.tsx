import { useState, useRef, useEffect } from 'react'
import { useSimulationStore, WORLD_SIZE_PRESETS, type WorldSizePreset } from '@/features/simulation/model/simulationStore'
import { Play, Settings, Sparkles, Wrench } from 'lucide-react'
import { startMenuBackground } from './background/startMenuBackground'

interface MainMenuProps {
  onStartGame: () => void
  onOpenModStudio: () => void
}

const WORLD_SIZE_INFO: Record<WorldSizePreset, { label: string; desc: string; fps: string }> = {
  tiny: { label: 'Tiny', desc: '256×192', fps: '~120+ FPS' },
  small: { label: 'Small', desc: '512×384', fps: '~90 FPS' },
  medium: { label: 'Medium', desc: '768×576', fps: '~60 FPS' },
  large: { label: 'Large', desc: '1024×768', fps: '~45 FPS' },
  full: { label: 'Full', desc: 'Viewport', fps: '~30 FPS' },
}

export function MainMenu({ onStartGame, onOpenModStudio }: MainMenuProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { worldSizePreset, setWorldSizePreset } = useSimulationStore()
  const [showSettings, setShowSettings] = useState(false)

  // Animated shader background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Resize canvas
    // Shader source
    // Compile shaders
    // Setup geometry (fullscreen quad)
    // Animation loop
    return startMenuBackground({ canvas })
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Shader Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {/* Logo */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl shadow-2xl shadow-purple-500/30" />
            <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
          </div>
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            Particula
          </h1>
          <p className="text-xl text-gray-400">
            Falling Sand Simulation
          </p>
        </div>

        {/* Main Menu Card */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 w-96 shadow-2xl">
          {!showSettings ? (
            // Main buttons
            <div className="space-y-4">
              <button
                onClick={onStartGame}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 
                         bg-gradient-to-r from-blue-600 to-purple-600 
                         hover:from-blue-500 hover:to-purple-500
                         rounded-xl font-semibold text-lg transition-all
                         shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40
                         hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play size={24} />
                Start Simulation
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 
                         bg-white/5 hover:bg-white/10 border border-white/10
                         rounded-xl font-medium transition-all
                         hover:scale-[1.02] active:scale-[0.98]"
              >
                <Settings size={20} />
                World Settings
              </button>

              <button
                onClick={onOpenModStudio}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 
                         bg-white/5 hover:bg-white/10 border border-white/10
                         rounded-xl font-medium transition-all
                         hover:scale-[1.02] active:scale-[0.98]"
              >
                <Wrench size={20} />
                Mod Studio
              </button>
            </div>
          ) : (
            // Settings panel
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">World Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Close settings"
                  aria-label="Close settings"
                >
                  ✕
                </button>
              </div>

              {/* World Size Selection */}
              <div className="space-y-3">
                <label className="text-sm text-gray-400 font-medium">World Size</label>
                <div className="grid grid-cols-1 gap-2">
                  {(Object.keys(WORLD_SIZE_PRESETS) as WorldSizePreset[]).map((preset) => {
                    const info = WORLD_SIZE_INFO[preset]
                    const isSelected = worldSizePreset === preset
                    return (
                      <button
                        key={preset}
                        onClick={() => setWorldSizePreset(preset)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg 
                                   border transition-all ${
                          isSelected
                            ? 'bg-purple-600/30 border-purple-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{info.label}</span>
                          <span className="text-sm text-gray-500">{info.desc}</span>
                        </div>
                        <span className={`text-sm ${isSelected ? 'text-purple-300' : 'text-gray-500'}`}>
                          {info.fps}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 
                         rounded-xl font-medium transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-sm text-gray-600">
          Press ESC to return to menu
        </p>
      </div>
    </div>
  )
}
