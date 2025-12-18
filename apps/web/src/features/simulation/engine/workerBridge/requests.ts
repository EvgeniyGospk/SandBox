import { debugWarn } from '@/platform/logging/log'

export type RequestTimeoutKind = 'pipette' | 'snapshot'

export type RequestTimeouts = {
  pipetteMs: number
  snapshotMs: number
}

export const DEFAULT_REQUEST_TIMEOUTS: RequestTimeouts = {
  pipetteMs: 1_000,
  snapshotMs: 5_000,
}

export type RequestState = {
  pipetteResolvers: Map<number, (elementId: number | null) => void>
  snapshotResolvers: Map<number, (data: ArrayBuffer | null) => void>
  requestTimeouts: Map<number, ReturnType<typeof setTimeout>>
  requestId: number

  timeouts: RequestTimeouts
  onTimeout: ((args: { kind: RequestTimeoutKind; id: number; timeoutMs: number }) => void) | null
}

export function createRequestState(args?: {
  timeouts?: Partial<RequestTimeouts>
  onTimeout?: (args: { kind: RequestTimeoutKind; id: number; timeoutMs: number }) => void
}): RequestState {
  const timeouts: RequestTimeouts = {
    ...DEFAULT_REQUEST_TIMEOUTS,
    ...(args?.timeouts ?? {}),
  }

  return {
    pipetteResolvers: new Map(),
    snapshotResolvers: new Map(),
    requestTimeouts: new Map(),
    requestId: 1,

    timeouts,
    onTimeout: args?.onTimeout ?? null,
  }
}

function clearRequestTimeout(state: RequestState, id: number): void {
  const timeoutId = state.requestTimeouts.get(id)
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId)
    state.requestTimeouts.delete(id)
  }
}

export function resolveAllPendingRequests(state: RequestState): void {
  for (const [id, resolver] of state.pipetteResolvers.entries()) {
    clearRequestTimeout(state, id)
    resolver(null)
  }
  state.pipetteResolvers.clear()

  for (const [id, resolver] of state.snapshotResolvers.entries()) {
    clearRequestTimeout(state, id)
    resolver(null)
  }
  state.snapshotResolvers.clear()

  state.requestTimeouts.clear()
}

function nextRequestId(state: RequestState): number {
  const id = state.requestId
  state.requestId += 1
  return id
}

export function handlePipetteResult(state: RequestState, id: number, elementId: number | null): void {
  const resolver = state.pipetteResolvers.get(id)
  if (resolver) {
    clearRequestTimeout(state, id)
    resolver(elementId)
    state.pipetteResolvers.delete(id)
  }
}

export function handleSnapshotResult(state: RequestState, id: number, buffer: ArrayBuffer | null): void {
  const resolver = state.snapshotResolvers.get(id)
  if (resolver) {
    clearRequestTimeout(state, id)
    resolver(buffer)
    state.snapshotResolvers.delete(id)
  }
}

export function requestPipette(state: RequestState, worker: Worker, x: number, y: number): Promise<number | null> {
  const id = nextRequestId(state)
  return new Promise((resolve) => {
    state.pipetteResolvers.set(id, resolve)
    const timeoutMs = state.timeouts.pipetteMs
    state.requestTimeouts.set(
      id,
      setTimeout(() => {
        if (!state.pipetteResolvers.has(id)) return
        state.pipetteResolvers.delete(id)
        state.requestTimeouts.delete(id)
        debugWarn('WorkerBridge request timed out', { kind: 'pipette', id, timeoutMs })
        state.onTimeout?.({ kind: 'pipette', id, timeoutMs })
        resolve(null)
      }, timeoutMs)
    )
    worker.postMessage({
      type: 'PIPETTE',
      id,
      x,
      y,
    })
  })
}

export function requestSnapshot(state: RequestState, worker: Worker): Promise<ArrayBuffer | null> {
  const id = nextRequestId(state)
  return new Promise((resolve) => {
    state.snapshotResolvers.set(id, resolve)
    const timeoutMs = state.timeouts.snapshotMs
    state.requestTimeouts.set(
      id,
      setTimeout(() => {
        if (!state.snapshotResolvers.has(id)) return
        state.snapshotResolvers.delete(id)
        state.requestTimeouts.delete(id)
        debugWarn('WorkerBridge request timed out', { kind: 'snapshot', id, timeoutMs })
        state.onTimeout?.({ kind: 'snapshot', id, timeoutMs })
        resolve(null)
      }, timeoutMs)
    )
    worker.postMessage({ type: 'SNAPSHOT', id })
  })
}
