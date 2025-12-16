import { loadSnapshotBuffer } from '../tools'

export function handleLoadSnapshot(msg: { type: 'LOAD_SNAPSHOT'; buffer: ArrayBuffer }): void {
  loadSnapshotBuffer(msg.buffer)
}
