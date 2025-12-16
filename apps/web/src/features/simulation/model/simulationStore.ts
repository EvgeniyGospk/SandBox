import { create } from 'zustand'
import type { RenderMode } from '@/core/engine/types'
import type { ISimulationBackend } from '@/core/engine/ISimulationBackend'
import { createSnapshotHistoryController } from './snapshotHistoryController'
import { WORLD_SIZE_PRESETS, getWorldSize, type WorldSizePreset } from './worldSize'

export { WORLD_SIZE_PRESETS, getWorldSize }
export type { WorldSizePreset }

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

  // Runtime backend (worker or main-thread fallback)
  backend: ISimulationBackend | null
  setBackend: (backend: ISimulationBackend | null) => void
  
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

  // Snapshots / Undo
  saveSnapshot: () => Promise<void>
  loadSnapshot: () => void
  captureSnapshotForUndo: () => Promise<void>
  undo: () => void
  redo: () => void
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  // This store also owns the runtime glue (backend + snapshots), but keeps it
  // behind stable action boundaries to avoid the old "mutable module singleton".
  //
  // Snapshot sizes can be large (worldW*worldH bytes), so enforce byte limits.
  ...(() => {
    const historyController = createSnapshotHistoryController({
      setState: (partial) => set(partial),
      getBackend: () => get().backend,
    })

    return {
      // Non-UI state
      backend: null,
      setBackend: (backend: ISimulationBackend | null) => historyController.setBackend(backend),

      // Initial state
      gameState: 'menu' as GameState,
      isPlaying: false,
      speed: 1,
      fps: 60,
      particleCount: 0,
      renderMode: 'normal' as RenderMode,
      gravity: { x: 0, y: 9.8 },
      ambientTemperature: 20,
      worldSizePreset: 'medium' as WorldSizePreset,

      // Actions
      startGame: () => set({ gameState: 'playing', isPlaying: true }),
      returnToMenu: () => {
        const backend = get().backend
        if (backend) backend.pause()
        historyController.clearHistory()
        set({ gameState: 'menu', isPlaying: false })
      },
      play: () => {
        get().backend?.play()
        set({ isPlaying: true })
      },
      pause: () => {
        get().backend?.pause()
        set({ isPlaying: false })
      },
      step: () => {
        get().backend?.step()
      },
      reset: () => {
        const backend = get().backend
        if (backend) {
          backend.pause()
          set({ isPlaying: false })
        }
        backend?.clear()
        historyController.clearHistory()
        set({ particleCount: 0, isPlaying: false })
      },
      setSpeed: (speed: 0.5 | 1 | 2 | 4) => {
        get().backend?.setSettings({ speed })
        set({ speed })
      },
      setGravity: (gravity: { x: number; y: number }) => {
        get().backend?.setSettings({ gravity })
        set({ gravity })
      },
      setAmbientTemperature: (ambientTemperature: number) => {
        get().backend?.setSettings({ ambientTemperature })
        set({ ambientTemperature })
      },
      setFps: (fps: number) => set({ fps }),
      setParticleCount: (particleCount: number) => set({ particleCount }),
      toggleRenderMode: () => {
        const currentMode = get().renderMode
        const newMode: RenderMode = currentMode === 'normal' ? 'thermal' : 'normal'
        get().backend?.setRenderMode(newMode)
        set({ renderMode: newMode })
      },
      setWorldSizePreset: (worldSizePreset: WorldSizePreset) => {
        historyController.clearHistory()
        set({ worldSizePreset, particleCount: 0 })
      },

      // Snapshots / Undo
      saveSnapshot: () => historyController.saveSnapshot(),
      loadSnapshot: () => historyController.loadSnapshot(),
      captureSnapshotForUndo: () => historyController.captureSnapshotForUndo(),
      undo: () => historyController.undo(),
      redo: () => historyController.redo(),
    }
  })(),
}))
