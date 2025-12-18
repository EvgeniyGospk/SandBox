import { useEffect, useRef, useState } from 'react'
import { useToolStore } from '@/features/tools/model/toolStore'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'
import { useContentPacksStore } from '@/features/simulation/model/contentPacksStore'
import { loadContentBundleJson, resetCamera } from '@/features/simulation/ui/canvas/canvasControls'
import { compileLegacyDefinitionsToBundle } from '@/features/simulation/content/compileLegacyDefinitions'
import {
  parsePacksFromDirectoryUpload,
  parsePacksFromFileEntries,
} from '@/features/simulation/content/compilePacksToBundle'
import { 
  Circle, 
  Square, 
  Minus, 
  Eraser, 
  Pipette, 
  PaintBucket,
  Hand,
  Focus,
  Undo,
  Redo,
  Save,
  Layers,
  FolderOpen,
  FileUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Thermometer
} from 'lucide-react'

import { ToolButton } from './topToolbar/ToolButton'
import { ModsModal } from './topToolbar/ModsModal'
import { collectDroppedFileEntries, readSelectedFiles, validateContentBundleJson } from './topToolbar/utils'
import { useRebuildActivePacks } from './topToolbar/useRebuildActivePacks'
import { extractZipToFileEntries, isZipFile } from './topToolbar/zip'
import { createPacksZip, downloadBlob, makeModsZipFilename } from './topToolbar/exportZip'

export function TopToolbar() {
  const contentBundleFileInputRef = useRef<HTMLInputElement>(null)
  const packFolderFileInputRef = useRef<HTMLInputElement>(null)
  const zipFileInputRef = useRef<HTMLInputElement>(null)
  const [packsOpen, setPacksOpen] = useState(false)
  const didAutoApplyPacksRef = useRef(false)
  const { 
    selectedTool, 
    brushShape, 
    brushSize, 
    setTool, 
    setBrushShape, 
    setBrushSize 
  } = useToolStore()
  
  const {
    renderMode,
    toggleRenderMode,
    undo,
    redo,
    saveSnapshot,
    loadSnapshot,
    contentBundleStatus,
    setContentBundleStatus,
  } = useSimulationStore()

  const { packs, addOrReplacePacks, togglePack, movePack, removePack, clearPacks, getActivePacks } = useContentPacksStore()

  const { rebuildUi, isRebuildBusy, rebuildActivePacks } = useRebuildActivePacks({
    getActivePacks,
    contentBundleStatus,
    setContentBundleStatus,
    loadContentBundleJson,
  })

  const onPickContentBundle = () => {
    contentBundleFileInputRef.current?.click()
  }

  const onZipSelected = async (files: FileList | null) => {
    const list = await readSelectedFiles(files)
    if (list.length === 0) return

    if (list.length !== 1 || !isZipFile(list[0])) {
      setContentBundleStatus({ phase: 'reload', status: 'error', message: 'Please select a single .zip file' })
      return
    }

    setContentBundleStatus({ phase: 'reload', status: 'loading' })

    try {
      const entries = await extractZipToFileEntries(list[0])
      const parsed = await parsePacksFromFileEntries({ entries })
      addOrReplacePacks(parsed)
      rebuildActivePacks()
    } catch (e) {
      setContentBundleStatus({
        phase: 'reload',
        status: 'error',
        message: e instanceof Error ? e.message : 'Failed to import zip',
      })
    }
  }

  const onPickPackFolder = () => {
    packFolderFileInputRef.current?.click()
  }

  const onPickZipFile = () => {
    zipFileInputRef.current?.click()
  }

  const onExportZip = () => {
    const active = getActivePacks()
    if (active.length === 0) {
      setContentBundleStatus({ phase: 'reload', status: 'error', message: 'No enabled packs to export' })
      return
    }

    try {
      const blob = createPacksZip({ packs: active })
      downloadBlob({ blob, filename: makeModsZipFilename() })
    } catch (e) {
      setContentBundleStatus({
        phase: 'reload',
        status: 'error',
        message: e instanceof Error ? e.message : 'Failed to export zip',
      })
    }
  }

  useEffect(() => {
    if (didAutoApplyPacksRef.current) return
    didAutoApplyPacksRef.current = true

    const active = useContentPacksStore.getState().getActivePacks()
    if (active.length > 0) {
      rebuildActivePacks()
    }
  }, [rebuildActivePacks])

  const onContentBundleSelected = async (files: FileList | null) => {
    const list = await readSelectedFiles(files)
    if (list.length === 0) return

    if (list.length === 1) {
      const json = await list[0].text()
      const validation = validateContentBundleJson(json)
      if (!validation.ok) {
        setContentBundleStatus({ phase: 'reload', status: 'error', message: validation.message })
        return
      }
      loadContentBundleJson(json)
      return
    }

    if (list.length === 2) {
      const elementsFile = list.find((f) => f.name.toLowerCase().includes('elements')) ?? null
      const reactionsFile = list.find((f) => f.name.toLowerCase().includes('reactions')) ?? null

      if (!elementsFile || !reactionsFile) {
        setContentBundleStatus({
          phase: 'reload',
          status: 'error',
          message: 'Please select exactly elements.json and reactions.json',
        })
        return
      }

      try {
        const [elementsJson, reactionsJson] = await Promise.all([elementsFile.text(), reactionsFile.text()])
        const bundle = compileLegacyDefinitionsToBundle({ elementsJson, reactionsJson, packId: 'base' })
        const json = JSON.stringify(bundle)
        const validation = validateContentBundleJson(json)
        if (!validation.ok) {
          setContentBundleStatus({ phase: 'reload', status: 'error', message: validation.message })
          return
        }
        loadContentBundleJson(json)
      } catch (e) {
        setContentBundleStatus({
          phase: 'reload',
          status: 'error',
          message: e instanceof Error ? e.message : 'Failed to compile definitions',
        })
      }
      return
    }

    setContentBundleStatus({
      phase: 'reload',
      status: 'error',
      message: 'Please select bundle.json OR (elements.json + reactions.json)',
    })
  }

  const onPackFolderSelected = async (files: FileList | null) => {
    const list = await readSelectedFiles(files)
    if (list.length === 0) return

    setContentBundleStatus({ phase: 'reload', status: 'loading' })

    try {
      const parsed = await parsePacksFromDirectoryUpload({ files: list })
      addOrReplacePacks(parsed)
      rebuildActivePacks()
    } catch (e) {
      setContentBundleStatus({
        phase: 'reload',
        status: 'error',
        message: e instanceof Error ? e.message : 'Failed to compile packs',
      })
    }
  }

  const onDropPacks = async (dataTransfer: DataTransfer) => {
    setContentBundleStatus({ phase: 'reload', status: 'loading' })
    try {
      const droppedFiles = Array.from(dataTransfer.files ?? [])
      if (droppedFiles.length === 1 && isZipFile(droppedFiles[0])) {
        const entries = await extractZipToFileEntries(droppedFiles[0])
        const parsed = await parsePacksFromFileEntries({ entries })
        addOrReplacePacks(parsed)
        rebuildActivePacks()
        return
      }

      if (droppedFiles.length > 1 && droppedFiles.some(isZipFile)) {
        setContentBundleStatus({ phase: 'reload', status: 'error', message: 'Please drop a single .zip file' })
        return
      }

      const entries = await collectDroppedFileEntries(dataTransfer)
      const parsed = await parsePacksFromFileEntries({ entries })
      addOrReplacePacks(parsed)
      rebuildActivePacks()
    } catch (err) {
      setContentBundleStatus({
        phase: 'reload',
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import packs',
      })
    }
  }

  return (
    <header className="h-14 bg-[#1A1A1A] border-b border-[#333] flex items-center px-4 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 bg-gradient-to-br from-[#3B82F6] to-purple-500 rounded" />
        <span className="font-semibold text-base">Particula</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Brush Shapes */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Circle size={16} />}
          isActive={brushShape === 'circle'}
          onClick={() => setBrushShape('circle')}
          tooltip="Circle Brush"
        />
        <ToolButton
          icon={<Square size={16} />}
          isActive={brushShape === 'square'}
          onClick={() => setBrushShape('square')}
          tooltip="Square Brush"
        />
        <ToolButton
          icon={<Minus size={16} />}
          isActive={brushShape === 'line'}
          onClick={() => setBrushShape('line')}
          tooltip="Line Tool"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Brush Size */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#A0A0A0]">Size:</span>
        <input
          type="range"
          min={1}
          max={50}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-28 h-1.5 bg-[#333] rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:bg-[#3B82F6]
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span className="text-sm text-[#A0A0A0] w-8 font-mono">{brushSize}</span>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Eraser size={16} />}
          isActive={selectedTool === 'eraser'}
          onClick={() => setTool('eraser')}
          tooltip="Eraser"
        />
        <ToolButton
          icon={<Hand size={16} />}
          isActive={selectedTool === 'move'}
          onClick={() => setTool('move')}
          tooltip="Move / Pan (Middle Mouse)"
        />
        <ToolButton
          icon={<Pipette size={16} />}
          isActive={selectedTool === 'pipette'}
          onClick={() => setTool('pipette')}
          tooltip="Pipette"
        />
        <ToolButton
          icon={<PaintBucket size={16} />}
          isActive={selectedTool === 'fill'}
          onClick={() => setTool('fill')}
          tooltip="Fill"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#333]" />

      {/* View Controls */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Thermometer size={16} />}
          isActive={renderMode === 'thermal'}
          onClick={toggleRenderMode}
          tooltip={renderMode === 'thermal' ? 'Normal View' : 'Thermal Vision'}
        />
        <ToolButton
          icon={<Focus size={16} />}
          onClick={resetCamera}
          tooltip="Reset View (1:1)"
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={<Undo size={16} />}
          onClick={undo}
          tooltip="Undo"
        />
        <ToolButton
          icon={<Redo size={16} />}
          onClick={redo}
          tooltip="Redo"
        />
        <div className="w-px h-6 bg-border mx-1" />
        <ToolButton
          icon={<Save size={16} />}
          onClick={saveSnapshot}
          tooltip="Save Snapshot"
        />
        <ToolButton
          icon={<FolderOpen size={16} />}
          onClick={loadSnapshot}
          tooltip="Load Snapshot"
        />
        <ToolButton
          icon={<Layers size={16} />}
          onClick={() => setPacksOpen(true)}
          tooltip="Mod Manager"
        />
        <ToolButton
          icon={<FileUp size={16} />}
          onClick={onPickContentBundle}
          tooltip="Load Content Bundle"
        />

        {contentBundleStatus ? (
          <div
            className="flex items-center gap-1 text-xs text-[#A0A0A0] px-1"
            title={
              contentBundleStatus.message
                ? `${contentBundleStatus.phase}: ${contentBundleStatus.status} — ${contentBundleStatus.message}`
                : `${contentBundleStatus.phase}: ${contentBundleStatus.status}`
            }
          >
            {contentBundleStatus.status === 'loading' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : contentBundleStatus.status === 'loaded' ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
          </div>
        ) : null}

        <input
          ref={contentBundleFileInputRef}
          type="file"
          accept="application/json,.json"
          multiple
          className="hidden"
          onChange={(e) => {
            void onContentBundleSelected(e.target.files)
            e.target.value = ''
          }}
        />

        <input
          ref={packFolderFileInputRef}
          type="file"
          accept="application/json,.json"
          multiple
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as unknown as Record<string, unknown>)}
          onChange={(e) => {
            void onPackFolderSelected(e.target.files)
            e.target.value = ''
          }}
        />

        <input
          ref={zipFileInputRef}
          type="file"
          accept="application/zip,.zip"
          className="hidden"
          onChange={(e) => {
            void onZipSelected(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <ModsModal
        open={packsOpen}
        onClose={() => setPacksOpen(false)}
        packs={packs}
        togglePack={togglePack}
        movePack={movePack}
        removePack={removePack}
        clearPacks={clearPacks}
        onPickPackFolder={onPickPackFolder}
        onPickZipFile={onPickZipFile}
        onExportZip={onExportZip}
        rebuildUi={rebuildUi}
        isRebuildBusy={isRebuildBusy}
        onRebuild={rebuildActivePacks}
        contentBundleStatus={contentBundleStatus}
        onDropPacks={onDropPacks}
      />
    </header>
  )
}
