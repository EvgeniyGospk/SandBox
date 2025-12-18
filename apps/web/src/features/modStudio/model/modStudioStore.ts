import { create } from 'zustand'

import {
  compilePacksToBundleFromParsedPacks,
  type PackElementFile,
  type PackInput,
  type PackManifest,
  type PackReactionFile,
  type RuntimeBundle,
} from '@/features/simulation/content/compilePacksToBundle'

import { validateContentBundleJson } from '@/features/simulation/ui/panels/topToolbar/utils'

type BuildStage = 'idle' | 'loadingBaseline' | 'ready' | 'compiling' | 'error'

type ModStudioState = {
  baseline: {
    json: string | null
    bundle: RuntimeBundle | null
    packs: PackInput[]
  }

  draft: {
    pack: PackInput
    selectedTab: 'elements' | 'reactions'
    selectedElementKey: string | null
    selectedReactionId: string | null
  }

  build: {
    stage: BuildStage
    message: string | null
    compiledJson: string | null
    compiledBundle: RuntimeBundle | null
    appliedJson: string | null
    appliedBundle: RuntimeBundle | null
    selectedElementId: number | null
    applyRevision: number
  }

  autoApplyToPreview: boolean

  loadBaseline: () => Promise<void>
  createDraftElement: () => void
  updateDraftElement: (key: string, patch: Partial<PackElementFile>) => void
  selectDraftElement: (key: string) => void

  setSelectedTab: (tab: 'elements' | 'reactions') => void
  createDraftReaction: () => void
  updateDraftReaction: (id: string, patch: Partial<PackReactionFile>) => void
  selectDraftReaction: (id: string) => void

  replaceDraftPackFromImport: (pack: PackInput) => void
  mergeDraftPackFromImport: (pack: PackInput) => void

  rebuildNow: () => void
  applyToPreview: () => void
  setAutoApplyToPreview: (v: boolean) => void
}

function u32ToHexColor(v: number): string {
  const u = (v >>> 0).toString(16).padStart(8, '0')
  return `0x${u.toUpperCase()}`
}

function densityToPack(v: number | null): number | 'Infinity' | null {
  if (v === null) return null
  if (v === Number.POSITIVE_INFINITY) return 'Infinity'
  return v
}

function splitFullKey(fullKey: string): { packId: string; key: string } {
  const idx = fullKey.indexOf(':')
  if (idx === -1) return { packId: 'base', key: fullKey }
  return { packId: fullKey.slice(0, idx), key: fullKey.slice(idx + 1) }
}

function bundleToParsedPacks(bundle: RuntimeBundle): PackInput[] {
  const manifests = bundle.packs

  const elementsByPack = new Map<string, Array<{ relPath: string; data: PackElementFile }>>()
  const reactionsByPack = new Map<string, Array<{ relPath: string; data: PackReactionFile }>>()

  for (const m of manifests) {
    elementsByPack.set(m.id, [])
    reactionsByPack.set(m.id, [])
  }

  for (const el of bundle.elements) {
    const packId = el.pack
    if (!elementsByPack.has(packId)) elementsByPack.set(packId, [])

    const split = splitFullKey(el.key)
    const key = split.key

    const data: PackElementFile = {
      kind: 'element',
      id: el.id,
      key,
      category: el.category,
      color: u32ToHexColor(el.color),
      density: densityToPack(el.density),
      dispersion: el.dispersion,
      lifetime: el.lifetime,
      defaultTemp: el.defaultTemp,
      heatConductivity: el.heatConductivity,
      bounce: el.bounce,
      friction: el.friction,
      flags: {
        flammable: el.flags.flammable,
        conductive: el.flags.conductive,
        corrosive: el.flags.corrosive,
        hot: el.flags.hot,
        cold: el.flags.cold,
        ignoreGravity: el.flags.ignoreGravity,
        rigid: el.flags.rigid,
      },
      behavior: el.behavior,
      phaseChange: el.phaseChange
        ? {
            high: el.phaseChange.high ? { temp: el.phaseChange.high.temp, to: el.phaseChange.high.to } : null,
            low: el.phaseChange.low ? { temp: el.phaseChange.low.temp, to: el.phaseChange.low.to } : null,
          }
        : null,
      hidden: el.hidden,
      ui: el.ui
        ? {
            category: el.ui.category,
            displayName: el.ui.displayName,
            description: el.ui.description,
            sort: el.ui.sort,
            hidden: el.ui.hidden,
          }
        : null,
    }

    elementsByPack.get(packId)!.push({ relPath: `content/packs/${packId}/elements/${key}.json`, data })
  }

  for (const r of bundle.reactions) {
    const packId = r.pack ?? 'base'
    if (!reactionsByPack.has(packId)) reactionsByPack.set(packId, [])

    const rawId = r.id ?? `${r.aggressorId}-${r.victimId}`
    const shortId = rawId.startsWith(`${packId}:`) ? rawId.slice(packId.length + 1) : rawId

    const data: PackReactionFile = {
      kind: 'reaction',
      id: shortId,
      aggressor: r.aggressor ?? 'base:empty',
      victim: r.victim ?? 'base:empty',
      resultAggressor: r.resultAggressor ?? null,
      resultVictim: r.resultVictim ?? null,
      spawn: r.spawn ?? null,
      chance: r.chance,
      comment: r.comment,
    }

    reactionsByPack.get(packId)!.push({ relPath: `content/packs/${packId}/reactions/${shortId}.json`, data })
  }

  const packs: PackInput[] = []
  for (const m of manifests) {
    packs.push({
      rootPath: `content/packs/${m.id}`,
      manifest: m,
      elementFiles: elementsByPack.get(m.id) ?? [],
      reactionFiles: reactionsByPack.get(m.id) ?? [],
    })
  }

  return packs
}

function createDraftPack(): PackInput {
  const manifest: PackManifest = {
    formatVersion: 1,
    id: 'draft',
    title: 'Draft Pack',
    version: '0.0.0',
    dependencies: ['base'],
  }

  return {
    rootPath: 'modstudio/draft',
    manifest,
    elementFiles: [],
    reactionFiles: [],
  }
}

function normalizeImportedPackToDraft(args: { pack: PackInput; baseManifest: PackManifest }): PackInput {
  const { pack, baseManifest } = args

  const deps = new Set<string>([...baseManifest.dependencies, ...pack.manifest.dependencies, 'base'])
  deps.delete('draft')

  const manifest: PackManifest = {
    formatVersion: 1,
    id: 'draft',
    title: pack.manifest.title,
    version: pack.manifest.version,
    dependencies: Array.from(deps.values()).filter((d) => d.length > 0),
  }

  const elementFiles = pack.elementFiles.map((f) => ({
    relPath: `modstudio/draft/elements/${f.data.key}.json`,
    data: { ...f.data, kind: 'element' as const, key: f.data.key },
  }))

  const reactionFiles = pack.reactionFiles.map((f) => ({
    relPath: `modstudio/draft/reactions/${f.data.id}.json`,
    data: { ...f.data, kind: 'reaction' as const, id: f.data.id },
  }))

  return {
    rootPath: 'modstudio/draft',
    manifest,
    elementFiles,
    reactionFiles,
  }
}

function generateDraftKey(existing: Set<string>): string {
  for (let i = 1; i < 1000; i++) {
    const key = `new_element_${i}`
    if (!existing.has(key)) return key
  }
  return `new_element_${Date.now()}`
}

function generateDraftReactionId(existing: Set<string>): string {
  for (let i = 1; i < 1000; i++) {
    const id = `r${i}`
    if (!existing.has(id)) return id
  }
  return `r${Date.now()}`
}

let rebuildTimer: number | null = null

export const useModStudioStore = create<ModStudioState>((set, get) => ({
  baseline: {
    json: null,
    bundle: null,
    packs: [],
  },

  draft: {
    pack: createDraftPack(),
    selectedTab: 'elements',
    selectedElementKey: null,
    selectedReactionId: null,
  },

  build: {
    stage: 'idle',
    message: null,
    compiledJson: null,
    compiledBundle: null,
    appliedJson: null,
    appliedBundle: null,
    selectedElementId: null,
    applyRevision: 0,
  },

  autoApplyToPreview: true,

  loadBaseline: async () => {
    set({ build: { ...get().build, stage: 'loadingBaseline', message: null } })

    try {
      const res = await fetch('/content/bundle.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to fetch /content/bundle.json (status=${res.status})`)
      const json = await res.text()
      const bundle = JSON.parse(json) as RuntimeBundle

      const packs = bundleToParsedPacks(bundle)

      set({
        baseline: {
          json,
          bundle,
          packs,
        },
        build: {
          ...get().build,
          stage: 'ready',
          message: null,
        },
      })

      if (get().draft.pack.elementFiles.length === 0) {
        get().createDraftElement()
      }

      get().rebuildNow()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load baseline bundle'
      set({ build: { ...get().build, stage: 'error', message } })
    }
  },

  createDraftElement: () => {
    const state = get()
    const pack = state.draft.pack

    const existing = new Set(pack.elementFiles.map((e) => e.data.key))
    const key = generateDraftKey(existing)

    const data: PackElementFile = {
      kind: 'element',
      key,
      category: 'powder',
      color: '0xFFC2B280',
      density: 1600,
      dispersion: 0,
      lifetime: 0,
      defaultTemp: 20,
      heatConductivity: 15,
      flags: {
        flammable: false,
        conductive: false,
        corrosive: false,
        hot: false,
        cold: false,
        ignoreGravity: false,
        rigid: false,
      },
      behavior: null,
      phaseChange: null,
      hidden: false,
      ui: {
        category: 'draft',
        displayName: key,
        description: '',
        sort: 0,
        hidden: false,
      },
    }

    const nextPack: PackInput = {
      ...pack,
      elementFiles: [...pack.elementFiles, { relPath: `modstudio/draft/elements/${key}.json`, data }],
    }

    set({
      draft: {
        ...state.draft,
        pack: nextPack,
        selectedTab: 'elements',
        selectedElementKey: key,
      },
    })

    get().rebuildNow()
  },

  updateDraftElement: (key: string, patch: Partial<PackElementFile>) => {
    const state = get()
    const pack = state.draft.pack

    const nextFiles = pack.elementFiles.map((f) => {
      if (f.data.key !== key) return f
      return { ...f, data: { ...f.data, ...patch, key: f.data.key } }
    })

    const nextPack: PackInput = { ...pack, elementFiles: nextFiles }

    set({
      draft: {
        ...state.draft,
        pack: nextPack,
      },
    })

    if (rebuildTimer !== null) window.clearTimeout(rebuildTimer)
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null
      get().rebuildNow()
    }, 250)
  },

  selectDraftElement: (key: string) => {
    set({ draft: { ...get().draft, selectedTab: 'elements', selectedElementKey: key } })

    const fullKey = `draft:${key}`
    const compiled = get().build.compiledBundle
    const applied = get().build.appliedBundle
    const id = (applied?.elementKeyToId ?? compiled?.elementKeyToId)?.[fullKey]
    set({ build: { ...get().build, selectedElementId: typeof id === 'number' ? id : null } })
  },

  setSelectedTab: (tab: 'elements' | 'reactions') => {
    set({ draft: { ...get().draft, selectedTab: tab } })
  },

  createDraftReaction: () => {
    const state = get()
    const pack = state.draft.pack

    const existing = new Set<string>(pack.reactionFiles.map((r) => r.data.id))
    const id = generateDraftReactionId(existing)

    const data: PackReactionFile = {
      kind: 'reaction',
      id,
      aggressor: 'base:water',
      victim: 'base:lava',
      resultAggressor: null,
      resultVictim: 'base:steam',
      chance: 1,
      spawn: null,
      comment: '',
    }

    const nextPack: PackInput = {
      ...pack,
      reactionFiles: [...pack.reactionFiles, { relPath: `modstudio/draft/reactions/${id}.json`, data }],
    }

    set({
      draft: {
        ...state.draft,
        pack: nextPack,
        selectedTab: 'reactions',
        selectedReactionId: id,
      },
    })

    get().rebuildNow()
  },

  updateDraftReaction: (id: string, patch: Partial<PackReactionFile>) => {
    const state = get()
    const pack = state.draft.pack

    const nextFiles = pack.reactionFiles.map((f) => {
      if (f.data.id !== id) return f
      return { ...f, data: { ...f.data, ...patch, id: f.data.id, kind: 'reaction' as const } }
    })

    const nextPack: PackInput = { ...pack, reactionFiles: nextFiles }

    set({
      draft: {
        ...state.draft,
        pack: nextPack,
      },
    })

    if (rebuildTimer !== null) window.clearTimeout(rebuildTimer)
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null
      get().rebuildNow()
    }, 250)
  },

  selectDraftReaction: (id: string) => {
    set({ draft: { ...get().draft, selectedTab: 'reactions', selectedReactionId: id } })
  },

  replaceDraftPackFromImport: (pack: PackInput) => {
    const state = get()
    const normalized = normalizeImportedPackToDraft({ pack, baseManifest: state.draft.pack.manifest })

    const firstElement = normalized.elementFiles[0]?.data.key ?? null
    const firstReaction = normalized.reactionFiles[0]?.data.id ?? null

    if (rebuildTimer !== null) window.clearTimeout(rebuildTimer)
    rebuildTimer = null

    set({
      draft: {
        ...state.draft,
        pack: normalized,
        selectedTab: 'elements',
        selectedElementKey: firstElement,
        selectedReactionId: firstReaction,
      },
    })

    get().rebuildNow()
  },

  mergeDraftPackFromImport: (pack: PackInput) => {
    const state = get()
    const current = state.draft.pack
    const incoming = normalizeImportedPackToDraft({ pack, baseManifest: current.manifest })

    const nextManifest: PackManifest = {
      ...current.manifest,
      title: incoming.manifest.title,
      version: incoming.manifest.version,
      dependencies: incoming.manifest.dependencies,
    }

    const nextElementFiles = [...current.elementFiles]
    const elementIdx = new Map(nextElementFiles.map((f, idx) => [f.data.key, idx]))
    for (const f of incoming.elementFiles) {
      const idx = elementIdx.get(f.data.key)
      if (idx === undefined) {
        elementIdx.set(f.data.key, nextElementFiles.length)
        nextElementFiles.push(f)
      } else {
        nextElementFiles[idx] = f
      }
    }

    const nextReactionFiles = [...current.reactionFiles]
    const reactionIdx = new Map(nextReactionFiles.map((f, idx) => [f.data.id, idx]))
    for (const f of incoming.reactionFiles) {
      const idx = reactionIdx.get(f.data.id)
      if (idx === undefined) {
        reactionIdx.set(f.data.id, nextReactionFiles.length)
        nextReactionFiles.push(f)
      } else {
        nextReactionFiles[idx] = f
      }
    }

    const nextPack: PackInput = {
      ...current,
      rootPath: 'modstudio/draft',
      manifest: nextManifest,
      elementFiles: nextElementFiles,
      reactionFiles: nextReactionFiles,
    }

    const nextSelectedElementKey =
      state.draft.selectedElementKey && elementIdx.has(state.draft.selectedElementKey)
        ? state.draft.selectedElementKey
        : nextPack.elementFiles[0]?.data.key ?? null

    const nextSelectedReactionId =
      state.draft.selectedReactionId && reactionIdx.has(state.draft.selectedReactionId)
        ? state.draft.selectedReactionId
        : nextPack.reactionFiles[0]?.data.id ?? null

    if (rebuildTimer !== null) window.clearTimeout(rebuildTimer)
    rebuildTimer = null

    set({
      draft: {
        ...state.draft,
        pack: nextPack,
        selectedElementKey: nextSelectedElementKey,
        selectedReactionId: nextSelectedReactionId,
      },
    })

    get().rebuildNow()
  },

  rebuildNow: () => {
    const state = get()

    set({ build: { ...state.build, stage: 'compiling', message: null } })

    try {
      const packs: PackInput[] = [...state.baseline.packs, state.draft.pack]
      const bundle = compilePacksToBundleFromParsedPacks({ packs })
      const json = JSON.stringify(bundle)

      const validation = validateContentBundleJson(json)
      if (!validation.ok) {
        set({
          build: {
            ...get().build,
            stage: 'error',
            message: validation.message,
            compiledBundle: null,
            compiledJson: null,
          },
        })
        return
      }

      const selectedKey = state.draft.selectedElementKey
      const fullKey = selectedKey ? `draft:${selectedKey}` : null
      const selectedId = fullKey ? bundle.elementKeyToId[fullKey] : undefined

      const shouldApply = state.autoApplyToPreview

      const nextApplyRevision = shouldApply ? state.build.applyRevision + 1 : state.build.applyRevision

      const prevApplied = state.build.appliedBundle
      const prevSelectedId = fullKey ? prevApplied?.elementKeyToId?.[fullKey] : undefined

      const nextSelectedId = shouldApply
        ? selectedId
        : prevSelectedId

      set({
        build: {
          stage: 'ready',
          message: null,
          compiledBundle: bundle,
          compiledJson: json,

          appliedBundle: shouldApply ? bundle : state.build.appliedBundle,
          appliedJson: shouldApply ? json : state.build.appliedJson,

          selectedElementId: typeof nextSelectedId === 'number' ? nextSelectedId : null,

          applyRevision: nextApplyRevision,
        },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to compile packs'
      set({
        build: {
          ...get().build,
          stage: 'error',
          message,
          compiledBundle: null,
          compiledJson: null,
        },
      })
    }
  },

  applyToPreview: () => {
    const state = get()
    const { compiledBundle, compiledJson } = state.build
    if (!compiledBundle || !compiledJson) return

    const selectedKey = state.draft.selectedElementKey
    const fullKey = selectedKey ? `draft:${selectedKey}` : null
    const selectedId = fullKey ? compiledBundle.elementKeyToId[fullKey] : undefined

    set({
      build: {
        ...state.build,
        appliedBundle: compiledBundle,
        appliedJson: compiledJson,
        selectedElementId: typeof selectedId === 'number' ? selectedId : state.build.selectedElementId,
        applyRevision: state.build.applyRevision + 1,
      },
    })
  },

  setAutoApplyToPreview: (v: boolean) => {
    set({ autoApplyToPreview: v })
    if (!v) return

    // If we already have a compiled bundle, apply it. Otherwise force rebuild.
    if (get().build.compiledBundle && get().build.compiledJson) {
      get().applyToPreview()
    } else {
      get().rebuildNow()
    }
  },
}))
