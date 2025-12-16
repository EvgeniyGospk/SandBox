import type { ISimulationBackend } from '@/core/engine/ISimulationBackend'
import { SnapshotHistoryStore } from '@/core/engine/SnapshotHistoryStore'

type SetState = (partial: Partial<{ backend: ISimulationBackend | null; isPlaying: boolean }>) => void

type Controller = {
  setBackend: (backend: ISimulationBackend | null) => void
  clearHistory: () => void
  saveSnapshot: () => Promise<void>
  loadSnapshot: () => void
  captureSnapshotForUndo: () => Promise<void>
  undo: () => void
  redo: () => void
}

export function createSnapshotHistoryController(args: {
  setState: SetState
  getBackend: () => ISimulationBackend | null
}): Controller {
  const { setState, getBackend } = args

  const history = new SnapshotHistoryStore({ maxEntries: 20, maxBytes: 64 * 1024 * 1024 })

  async function getCurrentSnapshot(): Promise<ArrayBuffer | null> {
    const backend = getBackend()
    if (!backend) return null
    return await backend.saveSnapshot()
  }

  function pauseAndUpdateUI(backend: ISimulationBackend): void {
    backend.pause()
    setState({ isPlaying: false })
  }

  return {
    setBackend: (backend: ISimulationBackend | null) => {
      if (!backend) history.clear()
      setState({ backend })
    },

    clearHistory: () => {
      history.clear()
    },

    saveSnapshot: async () => {
      const buffer = await getCurrentSnapshot()
      history.setSavedSnapshot(buffer)
      if (buffer) history.captureUndoSnapshot(buffer)
    },

    loadSnapshot: () => {
      const backend = getBackend()
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
      const backend = getBackend()
      if (!backend) return
      const buffer = history.undoCopy()
      if (!buffer) return
      pauseAndUpdateUI(backend)
      backend.loadSnapshot(buffer)
    },

    redo: () => {
      const backend = getBackend()
      if (!backend) return
      const buffer = history.redoCopy()
      if (!buffer) return
      pauseAndUpdateUI(backend)
      backend.loadSnapshot(buffer)
    },
  }
}
