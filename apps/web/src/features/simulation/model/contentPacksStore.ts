import { create } from 'zustand'

import type { PackInput } from '@/features/simulation/content/compilePacksToBundle'

const STORAGE_KEY = 'particula.contentPacks.v1'

type StoredPack = {
  id: string
  pack: PackInput
  enabled: boolean
}

function hasLocalStorage(): boolean {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis && !!globalThis.localStorage
  } catch {
    return false
  }
}

function loadPersistedPacks(): StoredPack[] {
  if (!hasLocalStorage()) return []
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as StoredPack[]
  } catch {
    return []
  }
}

function persistPacks(packs: StoredPack[]): void {
  if (!hasLocalStorage()) return
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(packs))
  } catch {
  }
}

interface ContentPacksState {
  packs: StoredPack[]

  addOrReplacePacks: (packs: PackInput[]) => void
  togglePack: (id: string) => void
  movePack: (id: string, dir: 'up' | 'down') => void
  removePack: (id: string) => void
  clearPacks: () => void

  getActivePacks: () => PackInput[]
}

export const useContentPacksStore = create<ContentPacksState>((set, get) => ({
  packs: loadPersistedPacks(),

  addOrReplacePacks: (incoming) => {
    set((state) => {
      const next = [...state.packs]
      const byId = new Map(next.map((p, idx) => [p.id, idx]))

      for (const pack of incoming) {
        const id = pack.manifest.id
        const idx = byId.get(id)
        if (idx === undefined) {
          next.push({ id, pack, enabled: true })
          byId.set(id, next.length - 1)
        } else {
          const prev = next[idx]
          next[idx] = { id, pack, enabled: prev.enabled }
        }
      }

      persistPacks(next)
      return { packs: next }
    })
  },

  togglePack: (id) => {
    set((state) => {
      const next = state.packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
      persistPacks(next)
      return { packs: next }
    })
  },

  movePack: (id, dir) => {
    set((state) => {
      const idx = state.packs.findIndex((p) => p.id === id)
      if (idx < 0) return state

      const next = [...state.packs]
      const swapWith = dir === 'up' ? idx - 1 : idx + 1
      if (swapWith < 0 || swapWith >= next.length) return state

      const tmp = next[swapWith]
      next[swapWith] = next[idx]
      next[idx] = tmp

      persistPacks(next)
      return { packs: next }
    })
  },

  removePack: (id) => {
    set((state) => {
      const next = state.packs.filter((p) => p.id !== id)
      persistPacks(next)
      return { packs: next }
    })
  },

  clearPacks: () => {
    persistPacks([])
    set({ packs: [] })
  },

  getActivePacks: () => get().packs.filter((p) => p.enabled).map((p) => p.pack),
}))
