import { create } from 'zustand'
import type { RenderMode } from '@/lib/engine'
import * as SimulationController from '@/lib/engine/SimulationController'

// World size presets (width x height)
export type WorldSizePreset = 'tiny' | 'small' | 'medium' | 'large' | 'full'

export const WORLD_SIZE_PRESETS: Record<WorldSizePreset, { width: number; height: number } | 'viewport'> = {
  tiny: { width: 256, height: 192 },
  small: { width: 512, height: 384 },
  medium: { width: 768, height: 576 },
  large: { width: 1024, height: 768 },
  full: 'viewport',
}

export function getWorldSize(preset: WorldSizePreset, viewport: { width: number; height: number }): { width: number; height: number } {
  const size = WORLD_SIZE_PRESETS[preset]
  if (size === 'viewport') return viewport
  return size
}

export type GameState = 'menu' | 'playing'

interface SimulationState {
  // State
  gameState: GameState
  isPlaying: boolean
  speed: 0.5 | 1 | 2 | 4
  fps: number
  particleCount: number
  renderMode: RenderMode
  
  // World settings
  gravity: { x: number; y: number }
  ambientTemperature: number
  worldSizePreset: WorldSizePreset
  
  // Actions
  startGame: () => void
  returnToMenu: () => void
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
  setWorldSizePreset: (preset: WorldSizePreset) => void
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  // Initial state
  gameState: 'menu',
  isPlaying: false,
  speed: 1,
  fps: 60,
  particleCount: 0,
  renderMode: 'normal' as RenderMode,
  gravity: { x: 0, y: 9.8 },
  ambientTemperature: 20,
  worldSizePreset: 'medium',
  
  // Actions
  startGame: () => set({ gameState: 'playing', isPlaying: true }),
  returnToMenu: () => {
    SimulationController.pause()
    set({ gameState: 'menu', isPlaying: false })
  },
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
  setWorldSizePreset: (worldSizePreset) => set({ worldSizePreset }),
}))
