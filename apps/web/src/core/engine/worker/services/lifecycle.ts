import { postResize, postSetViewport, resolveAllPendingRequests, terminateWorker, type RequestState } from '../bridge'

export function setViewportSize(worker: Worker | null, width: number, height: number): void {
  postSetViewport(worker, width, height)
}

export function resizeWorld(worker: Worker | null, width: number, height: number): void {
  postResize(worker, width, height)
}

export function destroyBridge(worker: Worker | null, requests: RequestState): void {
  resolveAllPendingRequests(requests)
  terminateWorker(worker)
}
