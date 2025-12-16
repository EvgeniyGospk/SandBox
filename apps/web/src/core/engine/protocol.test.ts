import { describe, expect, it } from 'vitest'
import { parseWorkerToMainMessage } from './protocol'

describe('parseWorkerToMainMessage', () => {
  it('parses READY', () => {
    const msg = parseWorkerToMainMessage({
      type: 'READY',
      protocolVersion: 1,
      width: 10,
      height: 20,
      capabilities: { webgl: true, sharedInput: false },
    })
    expect(msg).toEqual({
      type: 'READY',
      protocolVersion: 1,
      width: 10,
      height: 20,
      capabilities: { webgl: true, sharedInput: false },
    })
  })

  it('rejects invalid messages', () => {
    expect(parseWorkerToMainMessage(null)).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'READY', width: 10, height: 10 })).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'STATS', fps: '60', particleCount: 1 })).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'SNAPSHOT_RESULT', id: 1, buffer: {} })).toBeNull()
  })

  it('parses SNAPSHOT_RESULT with ArrayBuffer', () => {
    const buffer = new ArrayBuffer(4)
    const msg = parseWorkerToMainMessage({ type: 'SNAPSHOT_RESULT', id: 123, buffer })
    expect(msg).not.toBeNull()
    expect(msg?.type).toBe('SNAPSHOT_RESULT')
    if (msg?.type === 'SNAPSHOT_RESULT') {
      expect(msg.id).toBe(123)
      expect(msg.buffer).toBe(buffer)
    }
  })
})

