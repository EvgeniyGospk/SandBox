import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Sparkles, Wrench } from 'lucide-react'
import { PreviewSession, type PreviewSessionHandle } from './PreviewSession'
import { ElementEditor } from './ElementEditor'
import { ReactionEditor } from './ReactionEditor'
import { ModSelect, ModToggle } from './controls'
import { useModStudioStore } from '../model/modStudioStore'
import { createPacksZip, downloadBlob, makeModsZipFilename } from '@/features/simulation/ui/panels/topToolbar/exportZip'
import { extractZipToFileEntries, isZipFile } from '@/features/simulation/ui/panels/topToolbar/zip'
import { parsePacksFromFileEntries, type PackInput } from '@/features/simulation/content/compilePacksToBundle'

export function ModStudioPage(args: { onBack: () => void }) {
  const { onBack } = args

  const previewRef = useRef<PreviewSessionHandle | null>(null)

  const importZipInputRef = useRef<HTMLInputElement | null>(null)

  const [exportError, setExportError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace')
  const [importedPacks, setImportedPacks] = useState<PackInput[] | null>(null)
  const [selectedImportPackId, setSelectedImportPackId] = useState<string | null>(null)

  const {
    baseline,
    draft,
    build,
    autoApplyToPreview,
    loadBaseline,
    createDraftElement,
    selectDraftElement,
    updateDraftElement,
    setSelectedTab,
    createDraftReaction,
    selectDraftReaction,
    updateDraftReaction,
    replaceDraftPackFromImport,
    mergeDraftPackFromImport,
    applyToPreview,
    setAutoApplyToPreview,
  } = useModStudioStore()

  const isTypingTarget = (t: EventTarget | null): boolean => {
    if (!t) return false
    if (!(t instanceof HTMLElement)) return false
    if (t.closest('[data-typing-target="true"]')) return true
    const tag = t.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    if (t.isContentEditable) return true
    return false
  }

  const selectedImportPack = useMemo(() => {
    if (!importedPacks || !selectedImportPackId) return null
    return importedPacks.find((p) => p.manifest.id === selectedImportPackId) ?? null
  }, [importedPacks, selectedImportPackId])

  const importDiff = useMemo(() => {
    if (!selectedImportPack) return null

    const currentElKeys = new Set(draft.pack.elementFiles.map((f) => f.data.key))
    const currentRxIds = new Set(draft.pack.reactionFiles.map((f) => f.data.id))

    const incomingElKeys = new Set(selectedImportPack.elementFiles.map((f) => f.data.key))
    const incomingRxIds = new Set(selectedImportPack.reactionFiles.map((f) => f.data.id))

    let elAdded = 0
    let elOverwrite = 0
    for (const k of incomingElKeys) {
      if (currentElKeys.has(k)) elOverwrite++
      else elAdded++
    }

    let rxAdded = 0
    let rxOverwrite = 0
    for (const id of incomingRxIds) {
      if (currentRxIds.has(id)) rxOverwrite++
      else rxAdded++
    }

    return {
      current: { elements: currentElKeys.size, reactions: currentRxIds.size },
      incoming: { elements: incomingElKeys.size, reactions: incomingRxIds.size },
      merge: { elAdded, elOverwrite, rxAdded, rxOverwrite },
    }
  }, [draft.pack.elementFiles, draft.pack.reactionFiles, selectedImportPack])

  useEffect(() => {
    void loadBaseline()
  }, [loadBaseline])

  const selectedDraftFile = useMemo(() => {
    if (!draft.selectedElementKey) return null
    return draft.pack.elementFiles.find((f) => f.data.key === draft.selectedElementKey) ?? null
  }, [draft.pack.elementFiles, draft.selectedElementKey])

  const selectedDraftReactionFile = useMemo(() => {
    if (!draft.selectedReactionId) return null
    return draft.pack.reactionFiles.find((f) => f.data.id === draft.selectedReactionId) ?? null
  }, [draft.pack.reactionFiles, draft.selectedReactionId])

  const elementRefOptions = useMemo(() => {
    const b = build.compiledBundle
    if (!b) return []
    const fullKeys = Object.keys(b.elementKeyToId)

    const suffixCounts = new Map<string, number>()
    for (const k of fullKeys) {
      const idx = k.indexOf(':')
      if (idx === -1) continue
      const suffix = k.slice(idx + 1)
      suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1)
    }

    const shortKeys: string[] = []
    for (const [suffix, count] of suffixCounts.entries()) {
      if (count === 1) shortKeys.push(suffix)
    }

    shortKeys.sort((a, b) => a.localeCompare(b))
    fullKeys.sort((a, b) => a.localeCompare(b))

    return [...fullKeys, ...shortKeys]
  }, [build.compiledBundle])

  const onPatchSelected = useCallback(
    (patch: Parameters<typeof updateDraftElement>[1]) => {
      if (!draft.selectedElementKey) return
      updateDraftElement(draft.selectedElementKey, patch)
    },
    [draft.selectedElementKey, updateDraftElement]
  )

  const onPatchSelectedReaction = useCallback(
    (patch: Parameters<typeof updateDraftReaction>[1]) => {
      if (!draft.selectedReactionId) return
      updateDraftReaction(draft.selectedReactionId, patch)
    },
    [draft.selectedReactionId, updateDraftReaction]
  )

  const resolveElementIdFromRef = useCallback(
    (raw: string): number | null => {
      const bundle = build.appliedBundle
      if (!bundle) return null

      const ref = raw.trim()
      if (ref.length === 0) return null
      const normalized = ref.includes(':') ? ref : `${draft.pack.manifest.id}:${ref}`
      const id = bundle.elementKeyToId[normalized]
      return typeof id === 'number' ? id : null
    },
    [build.appliedBundle, draft.pack.manifest.id]
  )

  const testReactionClear = useCallback(() => {
    previewRef.current?.clear()
  }, [])

  const testReactionSpawnAggressor = useCallback(() => {
    const r = selectedDraftReactionFile?.data
    if (!r) return
    const id = resolveElementIdFromRef(r.aggressor)
    if (id === null) return
    previewRef.current?.spawnAtWorld({ worldX: 23, worldY: 25, elementId: id, radius: 3 })
  }, [resolveElementIdFromRef, selectedDraftReactionFile])

  const testReactionSpawnVictim = useCallback(() => {
    const r = selectedDraftReactionFile?.data
    if (!r) return
    const id = resolveElementIdFromRef(r.victim)
    if (id === null) return
    previewRef.current?.spawnAtWorld({ worldX: 27, worldY: 25, elementId: id, radius: 3 })
  }, [resolveElementIdFromRef, selectedDraftReactionFile])

  const testReactionSpawnBoth = useCallback(() => {
    previewRef.current?.clear()
    testReactionSpawnAggressor()
    testReactionSpawnVictim()
  }, [testReactionSpawnAggressor, testReactionSpawnVictim])

  const onExportZip = useCallback(() => {
    setExportError(null)

    try {
      const blob = createPacksZip({ packs: [draft.pack] })
      downloadBlob({ blob, filename: makeModsZipFilename() })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Failed to export zip')
    }
  }, [draft.pack])

  const onPickImportZip = useCallback(() => {
    importZipInputRef.current?.click()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (isTypingTarget(e.target)) return

      const key = e.key.toLowerCase()

      if (key === 'o') {
        e.preventDefault()
        onPickImportZip()
        return
      }

      if (key === 'e') {
        e.preventDefault()
        onExportZip()
        return
      }

      if (key === 's') {
        e.preventDefault()
        if (!autoApplyToPreview && build.compiledJson) {
          applyToPreview()
        } else {
          onExportZip()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applyToPreview, autoApplyToPreview, build.compiledJson, onExportZip, onPickImportZip])

  const onZipSelected = useCallback(
    async (files: FileList | null) => {
      setImportError(null)
      setImportedPacks(null)
      setSelectedImportPackId(null)

      if (!files || files.length === 0) return
      if (files.length !== 1 || !isZipFile(files[0]!)) {
        setImportError('Please select a single .zip file')
        return
      }

      setImportBusy(true)
      try {
        const entries = await extractZipToFileEntries(files[0]!)
        const packs = await parsePacksFromFileEntries({ entries })
        if (packs.length === 0) throw new Error('No packs found in zip')

        packs.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))

        setImportedPacks(packs)
        setSelectedImportPackId(packs[0]!.manifest.id)
        setImportMode('replace')
        setImportModalOpen(true)
      } catch (e) {
        setImportError(e instanceof Error ? e.message : 'Failed to import zip')
      } finally {
        setImportBusy(false)
      }
    },
    [extractZipToFileEntries]
  )

  const onCloseImportModal = useCallback(() => {
    setImportModalOpen(false)
    setImportedPacks(null)
    setSelectedImportPackId(null)
  }, [])

  const onConfirmImport = useCallback(() => {
    if (!importedPacks || !selectedImportPackId) return
    const chosen = importedPacks.find((p) => p.manifest.id === selectedImportPackId)
    if (!chosen) return

    try {
      if (importMode === 'replace') replaceDraftPackFromImport(chosen)
      else mergeDraftPackFromImport(chosen)
      onCloseImportModal()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Failed to import pack')
    }
  }, [importMode, importedPacks, mergeDraftPackFromImport, onCloseImportModal, replaceDraftPackFromImport, selectedImportPackId])

  const onBackClick = useCallback(() => {
    onBack()
  }, [onBack])

  const createElementFromTemplate = useCallback(
    (template: 'powder' | 'liquid' | 'gas' | 'solid') => {
      createDraftElement()
      const key = useModStudioStore.getState().draft.selectedElementKey
      if (!key) return

      if (template === 'powder') {
        updateDraftElement(key, {
          category: 'powder',
          color: '0xFFC2B280',
          density: 1600,
          heatConductivity: 15,
          dispersion: 0,
          bounce: 0.2,
          friction: 0.9,
        })
      }

      if (template === 'liquid') {
        updateDraftElement(key, {
          category: 'liquid',
          color: '0xFF2D7DFF',
          density: 1000,
          heatConductivity: 40,
          dispersion: 2,
          bounce: 0,
          friction: 0.95,
        })
      }

      if (template === 'gas') {
        updateDraftElement(key, {
          category: 'gas',
          color: '0x80CFE9FF',
          density: 1.2,
          heatConductivity: 5,
          dispersion: 6,
          bounce: 0,
          friction: 0.99,
        })
      }

      if (template === 'solid') {
        updateDraftElement(key, {
          category: 'solid',
          color: '0xFF8A8A8A',
          density: 2500,
          heatConductivity: 30,
          dispersion: 0,
          bounce: 0,
          friction: 0,
          flags: {
            flammable: false,
            conductive: false,
            corrosive: false,
            hot: false,
            cold: false,
            ignoreGravity: true,
            rigid: true,
          },
        })
      }
    },
    [createDraftElement, updateDraftElement]
  )

  const createReactionFromTemplate = useCallback(
    (template: 'transformVictim' | 'swap' | 'spawn') => {
      createDraftReaction()
      const id = useModStudioStore.getState().draft.selectedReactionId
      if (!id) return

      if (template === 'transformVictim') {
        updateDraftReaction(id, {
          aggressor: 'base:water',
          victim: 'base:lava',
          resultVictim: 'base:steam',
          resultAggressor: null,
          spawn: null,
          chance: 1,
          comment: 'Template: transform victim',
        })
      }

      if (template === 'swap') {
        updateDraftReaction(id, {
          aggressor: 'base:sand',
          victim: 'base:water',
          resultAggressor: 'base:water',
          resultVictim: 'base:sand',
          spawn: null,
          chance: 1,
          comment: 'Template: swap',
        })
      }

      if (template === 'spawn') {
        updateDraftReaction(id, {
          aggressor: 'base:fire',
          victim: 'base:wood',
          resultAggressor: null,
          resultVictim: null,
          spawn: 'base:smoke',
          chance: 1,
          comment: 'Template: spawn',
        })
      }
    },
    [createDraftReaction, updateDraftReaction]
  )

  const isBaselineLoading = build.stage === 'loadingBaseline' || (build.stage === 'idle' && baseline.bundle === null)

  return (
    <div className="flex flex-col h-screen bg-[#0D0D0D] text-white overflow-hidden">
      <header className="h-12 flex items-center justify-between px-4 border-b border-[#333] bg-[#0F0F0F]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackClick}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="flex items-center gap-2 ml-2">
            <Wrench size={18} className="text-purple-300" />
            <span className="font-semibold tracking-wide">ModStudio</span>
            <span className="text-xs text-gray-500">(Editor)</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <Sparkles size={16} className="text-purple-300" />
            <span>Draft Pack</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-500">v0.1</span>
          </div>

          <button
            onClick={onPickImportZip}
            disabled={importBusy}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
              importBusy
                ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                : 'bg-white/5 hover:bg-white/10 border-white/10'
            }`}
          >
            Import ZIP
          </button>

          <button
            onClick={onExportZip}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 transition-colors"
          >
            Export ZIP
          </button>
        </div>
      </header>

      {exportError ? (
        <div className="px-4 py-2 border-b border-[#333] bg-red-950/20 text-xs text-red-200">
          Export ZIP failed: {exportError}
        </div>
      ) : null}

      {importError ? (
        <div className="px-4 py-2 border-b border-[#333] bg-red-950/20 text-xs text-red-200">
          Import ZIP failed: {importError}
        </div>
      ) : null}

      <input
        ref={importZipInputRef}
        type="file"
        accept="application/zip,.zip"
        className="hidden"
        onChange={(e) => {
          void onZipSelected(e.target.files)
          e.target.value = ''
        }}
      />

      {importModalOpen && importedPacks ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            onClick={onCloseImportModal}
            className="absolute inset-0 bg-black/60"
            aria-label="Close import modal"
          />

          <div className="relative w-[520px] max-w-[90vw] rounded-2xl border border-white/10 bg-[#0F0F0F] p-5 shadow-2xl">
            <div className="text-lg font-semibold">Import ZIP</div>
            <div className="text-xs text-gray-400 mt-1">Choose pack and how to apply it to your workspace</div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs text-gray-400 mb-2">Pack</div>
                <ModSelect
                  value={(selectedImportPackId ?? '') as string}
                  onChange={(v) => setSelectedImportPackId(v)}
                  options={importedPacks.map((p) => ({ value: p.manifest.id, label: `${p.manifest.id} — ${p.manifest.title}` }))}
                  buttonClassName="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                />
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-2">Mode</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      importMode === 'replace'
                        ? 'bg-purple-600/25 border-purple-500/40'
                        : 'bg-black/20 border-white/10 hover:bg-white/5'
                    }`}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('merge')}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      importMode === 'merge'
                        ? 'bg-purple-600/25 border-purple-500/40'
                        : 'bg-black/20 border-white/10 hover:bg-white/5'
                    }`}
                  >
                    Merge
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  Replace overwrites your current draft. Merge upserts files by <span className="font-mono">element.key</span> and <span className="font-mono">reaction.id</span>.
                </div>
              </div>

              {importDiff ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold">Summary</div>
                  {importMode === 'replace' ? (
                    <div className="mt-2 text-xs text-gray-300 space-y-1">
                      <div>
                        Elements: {importDiff.incoming.elements} (replaces current {importDiff.current.elements})
                      </div>
                      <div>
                        Reactions: {importDiff.incoming.reactions} (replaces current {importDiff.current.reactions})
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-300 space-y-1">
                      <div>
                        Elements: +{importDiff.merge.elAdded} / overwrite {importDiff.merge.elOverwrite}
                      </div>
                      <div>
                        Reactions: +{importDiff.merge.rxAdded} / overwrite {importDiff.merge.rxOverwrite}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseImportModal}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmImport}
                className="px-3 py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-sm"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-[#1A1A1A] border-r border-[#333] flex flex-col">
          <div className="px-4 py-3 border-b border-[#333]">
            <div className="text-sm font-semibold">Library</div>
            <div className="text-xs text-gray-400">Packs / Elements / Reactions</div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold mb-1">Workspace</div>
              <div className="text-xs text-gray-400 mb-3">Создай элемент и тестируй справа в preview</div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-3 mb-3">
                <div className="text-xs text-gray-400 mb-2">Templates</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => createElementFromTemplate('powder')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Powder
                  </button>
                  <button
                    onClick={() => createElementFromTemplate('liquid')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Liquid
                  </button>
                  <button
                    onClick={() => createElementFromTemplate('gas')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Gas
                  </button>
                  <button
                    onClick={() => createElementFromTemplate('solid')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Solid
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    onClick={() => createReactionFromTemplate('transformVictim')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Reaction: Transform
                  </button>
                  <button
                    onClick={() => createReactionFromTemplate('swap')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Reaction: Swap
                  </button>
                  <button
                    onClick={() => createReactionFromTemplate('spawn')}
                    className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                  >
                    New Reaction: Spawn
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setSelectedTab('elements')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    draft.selectedTab === 'elements'
                      ? 'bg-purple-600/25 border-purple-500/40'
                      : 'bg-black/20 border-white/10 hover:bg-white/5'
                  }`}
                >
                  Elements
                </button>
                <button
                  onClick={() => setSelectedTab('reactions')}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    draft.selectedTab === 'reactions'
                      ? 'bg-purple-600/25 border-purple-500/40'
                      : 'bg-black/20 border-white/10 hover:bg-white/5'
                  }`}
                >
                  Reactions
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => createDraftElement()}
                  className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                >
                  New Element
                </button>
                <button
                  onClick={() => createDraftReaction()}
                  className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
                >
                  New Reaction
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
              {draft.selectedTab === 'elements' ? (
                <>
                  <div className="text-xs text-gray-400 mb-2">Draft elements</div>

                  <div className="space-y-1">
                    {draft.pack.elementFiles.map((f) => {
                      const isSelected = f.data.key === draft.selectedElementKey
                      const label = f.data.ui?.displayName ?? f.data.key
                      return (
                        <button
                          key={f.data.key}
                          onClick={() => selectDraftElement(f.data.key)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-purple-600/25 border-purple-500/40'
                              : 'bg-black/20 border-white/10 hover:bg-white/5'
                          }`}
                        >
                          <div className="text-sm font-medium truncate">{label}</div>
                          <div className="text-xs text-gray-400 truncate">draft:{f.data.key}</div>
                        </button>
                      )
                    })}

                    {draft.pack.elementFiles.length === 0 ? (
                      <div className="text-xs text-gray-500">No draft elements yet</div>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-gray-400 mb-2">Draft reactions</div>

                  <div className="space-y-1">
                    {draft.pack.reactionFiles.map((f) => {
                      const isSelected = f.data.id === draft.selectedReactionId
                      return (
                        <button
                          key={f.data.id}
                          onClick={() => selectDraftReaction(f.data.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-purple-600/25 border-purple-500/40'
                              : 'bg-black/20 border-white/10 hover:bg-white/5'
                          }`}
                        >
                          <div className="text-sm font-medium truncate">{f.data.id}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {f.data.aggressor} × {f.data.victim}
                          </div>
                        </button>
                      )
                    })}

                    {draft.pack.reactionFiles.length === 0 ? (
                      <div className="text-xs text-gray-500">No draft reactions yet</div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-[#0D0D0D] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#333] bg-[#111]">
            <div className="text-sm font-semibold">Editor</div>
            <div className="text-xs text-gray-400">Draft element → compile → apply → preview</div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              {isBaselineLoading ? (
                <div className="text-sm text-gray-300">Loading baseline…</div>
              ) : build.stage === 'error' ? (
                <div className="text-sm text-red-300">{build.message ?? 'Build error'}</div>
              ) : draft.selectedTab === 'elements' ? (
                !selectedDraftFile ? (
                  <div className="text-sm text-gray-300">Select a draft element to edit</div>
                ) : (
                  <div className="space-y-4">
                    <ElementEditor
                      element={selectedDraftFile.data}
                      packId={draft.pack.manifest.id}
                      elementRefOptions={elementRefOptions}
                      onPatch={onPatchSelected}
                    />

                    <div className="text-xs text-gray-400">
                      compiled → {build.compiledBundle ? `${build.compiledBundle.elements.length} elements` : '—'} | applied →{' '}
                      {build.appliedBundle ? `${build.appliedBundle.elements.length} elements` : '—'} | selectedId →{' '}
                      {build.selectedElementId ?? '—'}
                    </div>
                  </div>
                )
              ) : !selectedDraftReactionFile ? (
                <div className="text-sm text-gray-300">Select a draft reaction to edit</div>
              ) : (
                <div className="space-y-4">
                  <ReactionEditor
                    reaction={selectedDraftReactionFile.data}
                    packId={draft.pack.manifest.id}
                    elementRefOptions={elementRefOptions}
                    onPatch={onPatchSelectedReaction}
                    onTest={
                      build.appliedBundle
                        ? {
                            clear: testReactionClear,
                            spawnAggressor: testReactionSpawnAggressor,
                            spawnVictim: testReactionSpawnVictim,
                            spawnBoth: testReactionSpawnBoth,
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="w-96 bg-[#111] border-l border-[#333] flex flex-col">
          <div className="px-4 py-3 border-b border-[#333]">
            <div className="text-sm font-semibold">Live Preview</div>
            <div className="text-xs text-gray-400">50×50 sandbox (separate worker)</div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3 mb-3">
                <ModToggle checked={autoApplyToPreview} onCheckedChange={setAutoApplyToPreview} label="Auto-apply" />

                <button
                  onClick={() => applyToPreview()}
                  disabled={autoApplyToPreview || !build.compiledJson}
                  className={`ml-auto px-3 py-1.5 rounded-lg border transition-colors ${
                    autoApplyToPreview || !build.compiledJson
                      ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600/30 hover:bg-purple-600/40 border-purple-500/40'
                  }`}
                >
                  Apply
                </button>
              </div>

              <PreviewSession
                ref={previewRef}
                bundleJson={build.appliedJson}
                selectedElementId={build.selectedElementId}
                applyRevision={build.applyRevision}
              />
            </div>

            {build.stage === 'error' ? (
              <div className="mt-3 text-xs text-red-300 bg-red-950/30 border border-red-500/20 rounded-lg p-3">
                {build.message ?? 'Build error'}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
