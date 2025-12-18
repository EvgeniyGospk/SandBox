import { captureSnapshot } from '../tools'
import type { WorkerContext } from '../context'

export function handleSnapshot(ctx: WorkerContext, msg: { type: 'SNAPSHOT'; id: number }): void {
  const buffer = captureSnapshot(ctx)
  if (buffer) {
    self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer }, { transfer: [buffer] })
  } else {
    self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer: null })
  }
}
