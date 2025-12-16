import type { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'

import type { WorkerToMainMessage } from '../../protocol'
import {
  handlePipetteResult,
  handleSnapshotResult,
  installWorkerHandlers,
  postInit,
  setupSharedInputBuffer,
  terminateWorker,
  transferCanvasToOffscreen,
  type RequestState,
} from '../bridge'

export async function initExistingWorkerBridge(args: {
  worker: Worker
  canvas: HTMLCanvasElement

  width: number
  height: number
  viewportWidth: number
  viewportHeight: number

  expectedProtocolVersion: number
  parseMessage: (data: unknown) => WorkerToMainMessage | null

  requests: RequestState

  onUnknownMessage: (data: unknown) => void
  onReady: (width: number, height: number) => void
  onStats: (fps: number, particleCount: number) => void
  onError: (message: string) => void
  onCrash: (message: string, canRecover: boolean | undefined) => void

  resolveAllPendingRequests: () => void
  destroy: () => void

  setHasTransferred: (v: boolean) => void
  setInputBuffer: (buf: SharedInputBuffer | null) => void
  setUseSharedInput: (v: boolean) => void
}): Promise<void> {
  const {
    worker,
    canvas,
    width,
    height,
    viewportWidth,
    viewportHeight,
    expectedProtocolVersion,
    parseMessage,
    requests,
    onUnknownMessage,
    onReady,
    onStats,
    onError,
    onCrash,
    resolveAllPendingRequests,
    destroy,
    setHasTransferred,
    setInputBuffer,
    setUseSharedInput,
  } = args

  let resolveInit: (() => void) | null = null
  let rejectInit: ((err: Error) => void) | null = null

  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveInit = resolve
    rejectInit = reject
  })

  const rejectInitIfPending = (err: Error) => {
    if (!rejectInit) return
    rejectInit(err)
    resolveInit = null
    rejectInit = null
  }

  const resolveInitOnce = () => {
    resolveInit?.()
    resolveInit = null
    rejectInit = null
  }

  installWorkerHandlers({
    worker,
    expectedProtocolVersion,
    parseMessage,
    onUnknownMessage,
    onReady: (w, h) => {
      onReady(w, h)
    },
    onStats,
    onError,
    onCrash,
    onPipetteResult: (id, element) => {
      handlePipetteResult(requests, id, element)
    },
    onSnapshotResult: (id, buffer) => {
      handleSnapshotResult(requests, id, buffer)
    },
    resolveAllPendingRequests,
    destroy,
    resolveInit: resolveInitOnce,
    rejectInit: (err) => rejectInitIfPending(err),
    rejectInitIfPending,
  })

  let offscreen: OffscreenCanvas
  try {
    offscreen = transferCanvasToOffscreen(canvas)
    setHasTransferred(true)
  } catch (err) {
    terminateWorker(worker)
    setHasTransferred(false)
    throw err
  }

  const { inputBufferData, inputBuffer, useSharedInput } = setupSharedInputBuffer()
  setInputBuffer(inputBuffer)
  setUseSharedInput(useSharedInput)

  postInit(worker, {
    protocolVersion: expectedProtocolVersion,
    canvas: offscreen,
    width,
    height,
    viewportWidth,
    viewportHeight,
    inputBuffer: inputBufferData,
  })

  await readyPromise
}
