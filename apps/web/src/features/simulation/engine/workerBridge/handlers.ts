import type { WorkerToMainMessage } from '../protocol/index'
import type { SimulationStats } from '../worker/bridgeTypes'

export type UnknownMessageMode = 'strict' | 'lenient'

export type ErrorBehavior = 'terminate' | 'keep'

export type CrashBehavior = 'terminate' | 'keep' | 'terminateIfUnrecoverable'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isKnownWorkerToMainType(type: string): boolean {
  return (
    type === 'READY' ||
    type === 'CONTENT_MANIFEST' ||
    type === 'CONTENT_BUNDLE_STATUS' ||
    type === 'STATS' ||
    type === 'ERROR' ||
    type === 'CRASH' ||
    type === 'PIPETTE_RESULT' ||
    type === 'SNAPSHOT_RESULT'
  )
}

export function installWorkerHandlers(args: {
  worker: Worker
  expectedProtocolVersion: number
  parseMessage: (data: unknown) => WorkerToMainMessage | null

  unknownMessageMode?: UnknownMessageMode
  errorBehavior?: ErrorBehavior
  crashBehavior?: CrashBehavior

  onUnknownMessage: (data: unknown) => void

  onReady: (width: number, height: number) => void
  onStats: (stats: SimulationStats) => void
  onError: (message: string) => void
  onCrash: (message: string, canRecover: boolean | undefined) => void

  onContentManifest?: (json: string) => void
  onContentBundleStatus?: (args: { phase: 'init' | 'reload'; status: 'loading' | 'loaded' | 'error'; message?: string }) => void

  onPipetteResult: (id: number, elementId: number | null) => void
  onSnapshotResult: (id: number, buffer: ArrayBuffer | null) => void

  resolveAllPendingRequests: () => void
  destroy: () => void

  resolveInit: () => void
  rejectInit: (err: Error) => void
  rejectInitIfPending: (err: Error) => void
}): void {
  const {
    worker,
    expectedProtocolVersion,
    parseMessage,
    unknownMessageMode = 'strict',
    errorBehavior = 'terminate',
    crashBehavior = 'terminate',
    onUnknownMessage,
    onReady,
    onStats,
    onError,
    onCrash,
    onContentManifest = () => {},
    onContentBundleStatus = () => {},
    onPipetteResult,
    onSnapshotResult,
    resolveAllPendingRequests,
    destroy,
    resolveInit,
    rejectInit,
    rejectInitIfPending,
  } = args

  worker.onmessage = (e) => {
    if (isRecord(e.data) && typeof e.data.type === 'string' && !isKnownWorkerToMainType(e.data.type)) {
      onUnknownMessage(e.data)
      if (unknownMessageMode === 'lenient') return
      const message = 'Worker protocol error: unknown message type'
      onError(message)
      resolveAllPendingRequests()
      rejectInitIfPending(new Error(message))
      destroy()
      return
    }

    const msg = parseMessage(e.data)
    if (!msg) {
      onUnknownMessage(e.data)
      const message = 'Worker protocol error: unknown or invalid message'
      onError(message)
      resolveAllPendingRequests()
      rejectInitIfPending(new Error(message))
      destroy()
      return
    }

    switch (msg.type) {
      case 'READY': {
        if (msg.protocolVersion !== expectedProtocolVersion) {
          const message = `Worker protocol mismatch (expected ${expectedProtocolVersion}, got ${msg.protocolVersion})`
          onError(message)
          resolveAllPendingRequests()
          rejectInit(new Error(message))
          destroy()
          break
        }
        onReady(msg.width, msg.height)
        resolveInit()
        break
      }

      case 'CONTENT_MANIFEST': {
        onContentManifest(msg.json)
        break
      }

      case 'CONTENT_BUNDLE_STATUS': {
        onContentBundleStatus(msg)
        break
      }

      case 'STATS': {
        onStats(msg)
        break
      }

      case 'ERROR': {
        onError(msg.message)
        resolveAllPendingRequests()
        rejectInitIfPending(new Error(msg.message))
        if (errorBehavior === 'terminate') destroy()
        break
      }

      case 'CRASH': {
        resolveAllPendingRequests()
        onCrash(msg.message, msg.canRecover)
        rejectInitIfPending(new Error(msg.message))
        if (
          crashBehavior === 'terminate' ||
          (crashBehavior === 'terminateIfUnrecoverable' && msg.canRecover === false)
        ) {
          destroy()
        }
        break
      }

      case 'PIPETTE_RESULT': {
        onPipetteResult(msg.id, msg.elementId ?? null)
        break
      }

      case 'SNAPSHOT_RESULT': {
        onSnapshotResult(msg.id, msg.buffer ?? null)
        break
      }
    }
  }

  worker.onerror = (e) => {
    const message = (e as ErrorEvent)?.message ?? 'Worker error'
    onError(message)
    resolveAllPendingRequests()
    rejectInitIfPending(e instanceof Error ? e : new Error(message))
    destroy()
  }

  worker.onmessageerror = () => {
    const message = 'Worker message deserialization error'
    onError(message)
    resolveAllPendingRequests()
    rejectInitIfPending(new Error(message))
    destroy()
  }
}
