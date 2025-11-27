import { create } from 'zustand'
import type { RenderMode } from '@/lib/engine'
import * as SimulationController from '@/lib/engine/SimulationController'

interface SimulationState {
  // State
  isPlaying: boolean
  speed: 0.5 | 1 | 2 | 4
  fps: number
  particleCount: number
  renderMode: RenderMode
  
  // World settings
  gravity: { x: number; y: number }
  ambientTemperature: number
  
  // Actions
  play: () => void
  pause: () => void
  step: () => void
  reset: () => void
  setSpeed: (speed: 0.5 | 1 | 2 | 4) => void
  setGravity: (gravity: { x: number; y: number }) => void
  setAmbientTemperature: (temp: number) => void
  setFps: (fps: number) => void
  setParticleCount: (count: number) => void
  toggleRenderMode: () => void
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  // Initial state
  isPlaying: false,
  speed: 1,
  fps: 60,
  particleCount: 0,
  renderMode: 'normal' as RenderMode,
  gravity: { x: 0, y: 9.8 },
  ambientTemperature: 20,
  
  // Actions
  play: () => {
    SimulationController.play()
    set({ isPlaying: true })
  },
  pause: () => {
    SimulationController.pause()
    set({ isPlaying: false })
  },
  step: () => {
    SimulationController.step()
  },
  reset: () => {
    SimulationController.reset()
    set({ particleCount: 0, isPlaying: false })
  },
  setSpeed: (speed) => {
    SimulationController.setSpeed(speed)
    set({ speed })
  },
  setGravity: (gravity) => {
    SimulationController.setGravity(gravity)
    set({ gravity })
  },
  setAmbientTemperature: (ambientTemperature) => {
    SimulationController.setAmbientTemperature(ambientTemperature)
    set({ ambientTemperature })
  },
  setFps: (fps) => set({ fps }),
  setParticleCount: (particleCount) => set({ particleCount }),
  toggleRenderMode: () => {
    const currentMode = get().renderMode
    const newMode: RenderMode = currentMode === 'normal' ? 'thermal' : 'normal'
    SimulationController.setRenderMode(newMode)
    set({ renderMode: newMode })
  },
}))
