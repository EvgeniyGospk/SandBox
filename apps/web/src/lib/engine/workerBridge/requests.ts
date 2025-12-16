import type { ElementType } from '../types'

export type RequestState = {
  pipetteResolvers: Map<number, (el: ElementType | null) => void>
  snapshotResolvers: Map<number, (data: ArrayBuffer | null) => void>
  requestTimeouts: Map<number, ReturnType<typeof setTimeout>>
  requestId: number
}

export function createRequestState(): RequestState {
  return {
    pipetteResolvers: new Map(),
    snapshotResolvers: new Map(),
    requestTimeouts: new Map(),
    requestId: 1,
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
}

function nextRequestId(state: RequestState): number {
  const id = state.requestId
  state.requestId += 1
  return id
}

export function handlePipetteResult(state: RequestState, id: number, element: ElementType | null): void {
  const resolver = state.pipetteResolvers.get(id)
  if (resolver) {
    clearRequestTimeout(state, id)
    resolver(element)
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

export function requestPipette(state: RequestState, worker: Worker, x: number, y: number): Promise<ElementType | null> {
  const id = nextRequestId(state)
  return new Promise((resolve) => {
    state.pipetteResolvers.set(id, resolve)
    const timeoutMs = 1_000
    state.requestTimeouts.set(
      id,
      setTimeout(() => {
        if (!state.pipetteResolvers.has(id)) return
        state.pipetteResolvers.delete(id)
        state.requestTimeouts.delete(id)
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
    const timeoutMs = 5_000
    state.requestTimeouts.set(
      id,
      setTimeout(() => {
        if (!state.snapshotResolvers.has(id)) return
        state.snapshotResolvers.delete(id)
        state.requestTimeouts.delete(id)
        resolve(null)
      }, timeoutMs)
    )
    worker.postMessage({ type: 'SNAPSHOT', id })
  })
}
