import { useRef, useState } from 'react'

import type { PackInput } from '@/features/simulation/content/compilePacksToBundle'
import type { ContentBundleStatus } from '@/features/simulation/model/simulationStore'
import type { RebuildUiState } from './types'

import { Loader2, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown, Trash2, RefreshCw, X } from 'lucide-react'

type PackItem = {
  id: string
  pack: PackInput
  enabled: boolean
}

export function ModsModal(props: {
  open: boolean
  onClose: () => void

  packs: PackItem[]
  togglePack: (id: string) => void
  movePack: (id: string, dir: 'up' | 'down') => void
  removePack: (id: string) => void
  clearPacks: () => void

  onPickPackFolder: () => void
  onPickZipFile: () => void
  onExportZip: () => void

  rebuildUi: RebuildUiState
  isRebuildBusy: boolean
  onRebuild: () => void

  contentBundleStatus: ContentBundleStatus | null

  onDropPacks: (dataTransfer: DataTransfer) => Promise<void> | void
}) {
  const {
    open,
    onClose,
    packs,
    togglePack,
    movePack,
    removePack,
    clearPacks,
    onPickPackFolder,
    onPickZipFile,
    onExportZip,
    rebuildUi,
    isRebuildBusy,
    onRebuild,
    contentBundleStatus,
    onDropPacks,
  } = props

  const [isDragActive, setIsDragActive] = useState(false)
  const dragDepthRef = useRef(0)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="absolute top-16 right-4 w-[520px] max-w-[calc(100vw-2rem)] bg-[#111] border border-white/10 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="font-semibold">Mods</div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div
          className={`max-h-[60vh] overflow-auto ${isDragActive ? 'ring-2 ring-[#3B82F6]' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepthRef.current += 1
            setIsDragActive(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            dragDepthRef.current -= 1
            if (dragDepthRef.current <= 0) {
              dragDepthRef.current = 0
              setIsDragActive(false)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            dragDepthRef.current = 0
            setIsDragActive(false)
            void onDropPacks(e.dataTransfer)
          }}
        >
          <div className="px-4 pt-4">
            <div className="text-xs text-[#A0A0A0] border border-dashed border-white/15 rounded-lg px-3 py-2">
              Drag & drop pack folder(s) or a .zip here (must contain pack.json)
            </div>

            {rebuildUi.stage !== 'idle' ? (
              <div
                className={`mt-2 text-xs border rounded-lg px-3 py-2 ${
                  rebuildUi.stage === 'error'
                    ? 'bg-red-500/10 border-red-500/25 text-red-200'
                    : rebuildUi.stage === 'done'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-white/5 border-white/10 text-[#E5E7EB]'
                }`}
              >
                <div className="flex items-center gap-2">
                  {rebuildUi.stage === 'compiling' || rebuildUi.stage === 'reloading' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : rebuildUi.stage === 'done' ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <AlertTriangle size={14} />
                  )}

                  <div className="font-medium">
                    {rebuildUi.stage === 'compiling'
                      ? 'Compiling packs'
                      : rebuildUi.stage === 'reloading'
                        ? 'Reloading simulation'
                        : rebuildUi.stage === 'done'
                          ? 'Reloaded'
                          : 'Error'}
                  </div>
                </div>

                {rebuildUi.message ? <div className="mt-1 opacity-90">{rebuildUi.message}</div> : null}

                {rebuildUi.summary ? (
                  <div className="mt-2 opacity-90">
                    Packs: {rebuildUi.summary.enabledPacks}/{rebuildUi.summary.packs} · Elements: {rebuildUi.summary.elements}{' '}
                    · Reactions: {rebuildUi.summary.reactions}
                  </div>
                ) : null}
              </div>
            ) : contentBundleStatus?.message ? (
              <div className="mt-2 text-xs text-[#E5E7EB] bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                {contentBundleStatus.phase}: {contentBundleStatus.status}
                {' — '}
                {contentBundleStatus.message}
              </div>
            ) : null}
          </div>

          {packs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[#A0A0A0]">No packs imported yet.</div>
          ) : (
            <div className="p-2 space-y-2">
              {packs.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => togglePack(p.id)}
                    aria-label={`Toggle ${p.id}`}
                    className="h-4 w-4"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.pack.manifest.id}</div>
                    <div className="text-xs text-[#A0A0A0] truncate">
                      {p.pack.manifest.title} · {p.pack.manifest.version}
                    </div>
                  </div>

                  <button
                    onClick={() => movePack(p.id, 'up')}
                    disabled={idx === 0}
                    className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move up"
                    title="Move up"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => movePack(p.id, 'down')}
                    disabled={idx === packs.length - 1}
                    className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move down"
                    title="Move down"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => removePack(p.id)}
                    className="p-2 rounded-lg hover:bg-white/5"
                    aria-label="Remove"
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onPickPackFolder}
              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
            >
              Import
            </button>
            <button
              onClick={onPickZipFile}
              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
            >
              Import ZIP
            </button>
            <button
              onClick={onExportZip}
              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
            >
              Export ZIP
            </button>
            <button
              onClick={clearPacks}
              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm"
            >
              Clear
            </button>
          </div>

          <button
            onClick={onRebuild}
            disabled={isRebuildBusy}
            className="px-3 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2F74DD] disabled:opacity-60 disabled:hover:bg-[#3B82F6] text-sm font-medium flex items-center gap-2"
          >
            {isRebuildBusy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {isRebuildBusy ? 'Working…' : 'Rebuild & Reload'}
          </button>
        </div>
      </div>
    </div>
  )
}
