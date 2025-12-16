import type { ElementType } from '../api/types'
import type { WorkerToMainMessage } from '../protocol/index'

export function installWorkerHandlers(args: {
  worker: Worker
  expectedProtocolVersion: number
  parseMessage: (data: unknown) => WorkerToMainMessage | null

  onUnknownMessage: (data: unknown) => void

  onReady: (width: number, height: number) => void
  onStats: (fps: number, particleCount: number) => void
  onError: (message: string) => void
  onCrash: (message: string, canRecover: boolean | undefined) => void

  onPipetteResult: (id: number, element: ElementType | null) => void
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
    onUnknownMessage,
    onReady,
    onStats,
    onError,
    onCrash,
    onPipetteResult,
    onSnapshotResult,
    resolveAllPendingRequests,
    destroy,
    resolveInit,
    rejectInit,
    rejectInitIfPending,
  } = args

  worker.onmessage = (e) => {
    const msg = parseMessage(e.data)
    if (!msg) {
      onUnknownMessage(e.data)
      return
    }

    switch (msg.type) {
      case 'READY':
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

      case 'STATS':
        onStats(msg.fps, msg.particleCount)
        break

      case 'ERROR':
        onError(msg.message)
        resolveAllPendingRequests()
        rejectInitIfPending(new Error(msg.message))
        break

      case 'CRASH':
        resolveAllPendingRequests()
        onCrash(msg.message, msg.canRecover)
        break

      case 'PIPETTE_RESULT':
        onPipetteResult(msg.id, msg.element ?? null)
        break

      case 'SNAPSHOT_RESULT':
        onSnapshotResult(msg.id, msg.buffer ?? null)
        break
    }
  }

  worker.onerror = (e) => {
    const message = (e as ErrorEvent)?.message ?? 'Worker error'
    onError(message)
    resolveAllPendingRequests()
    rejectInitIfPending(e instanceof Error ? e : new Error(message))
  }

  worker.onmessageerror = () => {
    const message = 'Worker message deserialization error'
    onError(message)
    resolveAllPendingRequests()
    rejectInitIfPending(new Error(message))
  }
}
