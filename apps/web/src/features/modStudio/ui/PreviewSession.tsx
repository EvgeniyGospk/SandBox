import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Brush, Eraser, Loader2, Trash2 } from 'lucide-react'

import { WorkerBridge, isWorkerSupported } from '@/features/simulation/engine/worker'
import { EL_SAND, type ElementId } from '@/features/simulation/engine/api/types'
import { worldToClip } from '@/features/simulation/engine/transform'

import { ModSlider } from './controls'

type PreviewTool = 'brush' | 'eraser'

type PreviewStatus =
  | { phase: 'init' | 'loading'; message?: string }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }

const WORLD_W = 50
const WORLD_H = 50

export type PreviewSessionHandle = {
  clear: () => void
  spawnAtWorld: (args: { worldX: number; worldY: number; elementId: number; radius?: number }) => void
}

export const PreviewSession = forwardRef<PreviewSessionHandle, {
  bundleJson: string | null
  selectedElementId: number | null
  applyRevision: number
}>((args, ref) => {
  const { bundleJson, selectedElementId, applyRevision } = args

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const bridgeRef = useRef<WorkerBridge | null>(null)

  const lastAppliedBundleRef = useRef<string | null>(null)
  const lastAppliedRevisionRef = useRef<number>(-1)

  const [bundleStatus, setBundleStatus] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'loaded' }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' })

  const [status, setStatus] = useState<PreviewStatus>({ phase: 'init' })
  const [tool, setTool] = useState<PreviewTool>('brush')
  const [brushRadius, setBrushRadius] = useState(4)
  const [fallbackElementId] = useState<ElementId>(EL_SAND)

  const isDrawingRef = useRef(false)

  const canUseWorker = useMemo(() => isWorkerSupported(), [])

  const syncViewport = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const bridge = bridgeRef.current
    if (!canvas || !container || !bridge) return

    const rect = container.getBoundingClientRect()
    const nextW = Math.max(1, Math.floor(rect.width))
    const nextH = Math.max(1, Math.floor(rect.height))

    if (canvas.width !== nextW) canvas.width = nextW
    if (canvas.height !== nextH) canvas.height = nextH

    bridge.setViewportSize(nextW, nextH)
  }, [])

  const clear = useCallback(() => {
    bridgeRef.current?.clear()
  }, [])

  const spawnAtWorld = useCallback(
    (spawnArgs: { worldX: number; worldY: number; elementId: number; radius?: number }) => {
      const bridge = bridgeRef.current
      const canvas = canvasRef.current
      if (!bridge || !canvas) return

      const radius = Math.max(1, Math.floor(spawnArgs.radius ?? 3))

      const clip = worldToClip(
        spawnArgs.worldX,
        spawnArgs.worldY,
        { zoom: 1, panX: 0, panY: 0 },
        { width: canvas.width, height: canvas.height },
        { width: WORLD_W, height: WORLD_H }
      )

      const sx = ((clip.x + 1) * 0.5) * canvas.width
      const sy = ((1 - clip.y) * 0.5) * canvas.height

      bridge.setTransform(1, 0, 0)
      bridge.handleInput(sx, sy, radius, spawnArgs.elementId, 'brush')
      bridge.endStroke()
    },
    []
  )

  useImperativeHandle(
    ref,
    () => ({
      clear,
      spawnAtWorld,
    }),
    [clear, spawnAtWorld]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!canUseWorker) {
      setStatus({ phase: 'error', message: 'Worker/OffscreenCanvas is not supported in this browser.' })
      return
    }

    const bridge = new WorkerBridge()
    bridgeRef.current = bridge

    setStatus({ phase: 'loading', message: 'Starting preview worker…' })
    setBundleStatus({ phase: 'idle' })

    bridge.onReady = () => {
      setStatus({ phase: 'ready' })
      syncViewport()
      bridge.setSettings({ gravity: { x: 0, y: 9.8 }, ambientTemperature: 20, speed: 1 })
      bridge.setRenderMode('normal')
      bridge.setTransform(1, 0, 0)
      bridge.play()
    }

    bridge.onContentBundleStatus = (s) => {
      if (s.phase !== 'reload') return
      if (s.status === 'loading') setBundleStatus({ phase: 'loading' })
      else if (s.status === 'loaded') setBundleStatus({ phase: 'loaded' })
      else setBundleStatus({ phase: 'error', message: s.message ?? 'Failed to load bundle' })
    }

    bridge.onError = (msg) => {
      setStatus({ phase: 'error', message: msg })
    }

    bridge.onCrash = (msg) => {
      setStatus({ phase: 'error', message: msg })
    }

    syncViewport()

    void bridge
      .init(canvas, WORLD_W, WORLD_H, canvas.width, canvas.height)
      .catch((err) => {
        setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      bridge.destroy()
      bridgeRef.current = null
    }
  }, [canUseWorker, syncViewport])

  useEffect(() => {
    if (status.phase !== 'ready') return
    const bridge = bridgeRef.current
    if (!bridge) return
    if (!bundleJson) return

    if (bundleJson === lastAppliedBundleRef.current && applyRevision === lastAppliedRevisionRef.current) return
    lastAppliedBundleRef.current = bundleJson
    lastAppliedRevisionRef.current = applyRevision
    setBundleStatus({ phase: 'loading' })
    bridge.loadContentBundle(bundleJson)
  }, [applyRevision, bundleJson, status.phase])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(() => {
      syncViewport()
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [syncViewport])

  const getCanvasPosition = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / Math.max(1, rect.width)
    const scaleY = canvas.height / Math.max(1, rect.height)

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  const drawAt = useCallback(
    (screenX: number, screenY: number) => {
      const bridge = bridgeRef.current
      if (!bridge) return

      bridge.setTransform(1, 0, 0)
      const el = (Number.isInteger(selectedElementId) ? (selectedElementId as number) : fallbackElementId) as number
      bridge.handleInput(screenX, screenY, brushRadius, el, tool)
    },
    [brushRadius, fallbackElementId, selectedElementId, tool]
  )

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button !== 0) return

      const pos = getCanvasPosition(e)
      isDrawingRef.current = true
      drawAt(pos.x, pos.y)
    },
    [drawAt, getCanvasPosition]
  )

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (!isDrawingRef.current) return
      const pos = getCanvasPosition(e)
      drawAt(pos.x, pos.y)
    },
    [drawAt, getCanvasPosition]
  )

  const stopDrawing = useCallback(() => {
    if (isDrawingRef.current && bridgeRef.current) {
      bridgeRef.current.endStroke()
    }
    isDrawingRef.current = false
  }, [])

  const handleClear = clear

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Preview</div>

        {status.phase !== 'ready' ? (
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <Loader2 className="animate-spin" size={14} />
            <span>{status.phase === 'error' ? 'Error' : 'Loading'}</span>
          </div>
        ) : bundleStatus.phase === 'loading' ? (
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <Loader2 className="animate-spin" size={14} />
            <span>Applying bundle…</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTool('brush')}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
            tool === 'brush' ? 'bg-purple-600/30 border-purple-500/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
          }`}
        >
          <Brush size={16} />
          Brush
        </button>

        <button
          onClick={() => setTool('eraser')}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
            tool === 'eraser' ? 'bg-purple-600/30 border-purple-500/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
          }`}
        >
          <Eraser size={16} />
          Eraser
        </button>

        <button
          onClick={handleClear}
          className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
        >
          <Trash2 size={16} />
          Clear
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-400 w-14">Size</label>
        <div className="flex-1">
          <ModSlider value={brushRadius} min={1} max={12} step={1} onChange={setBrushRadius} />
        </div>
        <div className="text-xs text-gray-400 w-8 text-right">{brushRadius}</div>
      </div>

      <div ref={containerRef} className="w-full aspect-square rounded-lg bg-black/40 border border-white/10 overflow-hidden">
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
        />
      </div>

      {status.phase === 'error' ? (
        <div className="text-xs text-red-300 bg-red-950/30 border border-red-500/20 rounded-lg p-3">
          {status.message}
        </div>
      ) : bundleStatus.phase === 'error' ? (
        <div className="text-xs text-red-300 bg-red-950/30 border border-red-500/20 rounded-lg p-3">
          {bundleStatus.message}
        </div>
      ) : null}
    </div>
  )
})

PreviewSession.displayName = 'PreviewSession'
