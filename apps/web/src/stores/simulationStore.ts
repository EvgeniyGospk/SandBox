import { create } from 'zustand'
import type { RenderMode } from '@/lib/engine/types'
import type { ISimulationBackend } from '@/lib/engine/ISimulationBackend'
import { SnapshotHistoryStore } from '@/lib/engine/SnapshotHistoryStore'

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
    const history = new SnapshotHistoryStore({ maxEntries: 20, maxBytes: 64 * 1024 * 1024 })

    async function getCurrentSnapshot(): Promise<ArrayBuffer | null> {
      const backend = get().backend
      if (!backend) return null
      return await backend.saveSnapshot()
    }

    function pauseAndUpdateUI(backend: ISimulationBackend): void {
      backend.pause()
      set({ isPlaying: false })
    }

    return {
      // Non-UI state
      backend: null,
      setBackend: (backend: ISimulationBackend | null) => {
        if (!backend) history.clear()
        set({ backend })
      },

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
        if (backend) pauseAndUpdateUI(backend)
        history.clear()
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
        if (backend) pauseAndUpdateUI(backend)
        backend?.clear()
        history.clear()
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
        history.clear()
        set({ worldSizePreset, particleCount: 0 })
      },

      // Snapshots / Undo
      saveSnapshot: async () => {
        const buffer = await getCurrentSnapshot()
        history.setSavedSnapshot(buffer)
        if (buffer) history.captureUndoSnapshot(buffer)
      },
      loadSnapshot: () => {
        const backend = get().backend
        if (!backend) return
        const buffer = history.getSavedSnapshotCopy()
        if (!buffer) return
        pauseAndUpdateUI(backend)
        backend.loadSnapshot(buffer)
      },
      captureSnapshotForUndo: async () => {
        const buffer = await getCurrentSnapshot()
        if (!buffer) return
        history.captureUndoSnapshot(buffer)
      },
      undo: () => {
        const backend = get().backend
        if (!backend) return
        const buffer = history.undoCopy()
        if (!buffer) return
        pauseAndUpdateUI(backend)
        backend.loadSnapshot(buffer)
      },
      redo: () => {
        const backend = get().backend
        if (!backend) return
        const buffer = history.redoCopy()
        if (!buffer) return
        pauseAndUpdateUI(backend)
        backend.loadSnapshot(buffer)
      },
    }
  })(),
}))
