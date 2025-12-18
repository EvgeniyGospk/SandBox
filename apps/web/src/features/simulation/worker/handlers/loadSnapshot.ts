import { loadSnapshotBuffer } from '../tools'
import type { WorkerContext } from '../context'

export function handleLoadSnapshot(ctx: WorkerContext, msg: { type: 'LOAD_SNAPSHOT'; buffer: ArrayBuffer }): void {
  loadSnapshotBuffer(ctx, msg.buffer)
}
