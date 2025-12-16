import type { ElementType } from '../../types'

import { postLoadSnapshot, requestPipette, requestSnapshot, type RequestState } from '../bridge'

export function pipette(args: {
  requests: RequestState
  worker: Worker | null
  screenX: number
  screenY: number
}): Promise<ElementType | null> {
  if (!args.worker) return Promise.resolve(null)
  return requestPipette(args.requests, args.worker, args.screenX, args.screenY)
}

export function snapshot(args: { requests: RequestState; worker: Worker | null }): Promise<ArrayBuffer | null> {
  if (!args.worker) return Promise.resolve(null)
  return requestSnapshot(args.requests, args.worker)
}

export function loadSnapshot(args: { worker: Worker | null; buffer: ArrayBuffer }): void {
  postLoadSnapshot(args.worker, args.buffer)
}
