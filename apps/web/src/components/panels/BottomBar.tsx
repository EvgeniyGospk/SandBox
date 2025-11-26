import { useSimulationStore } from '@/stores/simulationStore'
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react'

export function BottomBar() {
  const {
    isPlaying,
    speed,
    fps,
    particleCount,
    play,
    pause,
    step,
    reset,
    setSpeed
  } = useSimulationStore()

  const speedOptions = [0.5, 1, 2, 4] as const

  return (
    <footer className="h-12 bg-[#1A1A1A] border-t border-[#333] flex items-center px-4 gap-4">
      {/* Playback Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={isPlaying ? pause : play}
          className="p-2 rounded-lg hover:bg-[#252525] transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          onClick={step}
          disabled={isPlaying}
          className="p-2 rounded-lg hover:bg-[#252525] transition-colors disabled:opacity-50"
          title="Step"
        >
          <SkipForward size={18} />
        </button>
        <button
          onClick={reset}
          className="p-2 rounded-lg hover:bg-[#252525] transition-colors text-[#EF4444]"
          title="Reset"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Speed Control */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#A0A0A0]">Speed:</span>
        <div className="flex gap-0.5">
          {speedOptions.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                speed === s
                  ? 'bg-[#3B82F6] text-white'
                  : 'bg-[#252525] text-[#A0A0A0] hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span 
            className={`w-2.5 h-2.5 rounded-full ${
              fps >= 50 ? 'bg-[#22C55E]' : fps >= 30 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
            }`} 
          />
          <span className="text-[#A0A0A0]">FPS:</span>
          <span className="font-mono w-6">{fps}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#A0A0A0]">Particles:</span>
          <span className="font-mono">{formatNumber(particleCount)}</span>
        </div>
      </div>
    </footer>
  )
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}
