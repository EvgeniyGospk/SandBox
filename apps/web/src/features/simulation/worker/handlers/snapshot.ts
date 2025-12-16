import { captureSnapshot } from '../tools'

export function handleSnapshot(msg: { type: 'SNAPSHOT'; id: number }): void {
  const buffer = captureSnapshot()
  if (buffer) {
    self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer }, { transfer: [buffer] })
  } else {
    self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer: null })
  }
}
