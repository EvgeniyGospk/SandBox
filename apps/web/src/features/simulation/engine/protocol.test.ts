import { describe, expect, it } from 'vitest'
import { parseWorkerToMainMessage } from './protocol'

describe('parseWorkerToMainMessage', () => {
  it('parses CONTENT_MANIFEST', () => {
    const msg = parseWorkerToMainMessage({ type: 'CONTENT_MANIFEST', json: '{"formatVersion":1}' })
    expect(msg).toEqual({ type: 'CONTENT_MANIFEST', json: '{"formatVersion":1}' })
  })

  it('parses CONTENT_BUNDLE_STATUS', () => {
    const msg = parseWorkerToMainMessage({
      type: 'CONTENT_BUNDLE_STATUS',
      phase: 'reload',
      status: 'error',
      message: 'Invalid JSON',
    })
    expect(msg).toEqual({
      type: 'CONTENT_BUNDLE_STATUS',
      phase: 'reload',
      status: 'error',
      message: 'Invalid JSON',
    })
  })

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

  it('accepts extra fields (forward/backward compatibility)', () => {
    const msg = parseWorkerToMainMessage({
      type: 'STATS',
      fps: 60,
      particleCount: 123,
      extra: { nested: true },
    })
    expect(msg).toEqual({ type: 'STATS', fps: 60, particleCount: 123 })
  })

  it('parses STATS optional fields', () => {
    const msg = parseWorkerToMainMessage({
      type: 'STATS',
      fps: 60,
      particleCount: 123,
      stepsPerFrame: 2,
      inputOverflowCount: 5,
      wasmMemoryBytes: 1024,
    })
    expect(msg).toEqual({
      type: 'STATS',
      fps: 60,
      particleCount: 123,
      stepsPerFrame: 2,
      inputOverflowCount: 5,
      wasmMemoryBytes: 1024,
    })
  })

  it('rejects invalid messages', () => {
    expect(parseWorkerToMainMessage(null)).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'READY', width: 10, height: 10 })).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'STATS', fps: '60', particleCount: 1 })).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'STATS', fps: 60, particleCount: 1, stepsPerFrame: '2' })).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'SNAPSHOT_RESULT', id: 1, buffer: {} })).toBeNull()
    expect(parseWorkerToMainMessage({ type: 'CONTENT_MANIFEST', json: 123 })).toBeNull()

    expect(
      parseWorkerToMainMessage({ type: 'CONTENT_BUNDLE_STATUS', phase: 'nope', status: 'loading' })
    ).toBeNull()
    expect(
      parseWorkerToMainMessage({ type: 'CONTENT_BUNDLE_STATUS', phase: 'init', status: 'nope' })
    ).toBeNull()
    expect(
      parseWorkerToMainMessage({ type: 'CONTENT_BUNDLE_STATUS', phase: 'init', status: 'error', message: 123 })
    ).toBeNull()
  })

  it('rejects unknown message types', () => {
    expect(parseWorkerToMainMessage({ type: 'UNKNOWN', foo: 1 })).toBeNull()
  })

  it('parses CRASH with optional canRecover', () => {
    expect(parseWorkerToMainMessage({ type: 'CRASH', message: 'boom' })).toEqual({
      type: 'CRASH',
      message: 'boom',
      canRecover: undefined,
    })
    expect(parseWorkerToMainMessage({ type: 'CRASH', message: 'boom', canRecover: false })).toEqual({
      type: 'CRASH',
      message: 'boom',
      canRecover: false,
    })
  })

  it('rejects CRASH with invalid canRecover', () => {
    expect(parseWorkerToMainMessage({ type: 'CRASH', message: 'boom', canRecover: 'no' })).toBeNull()
  })

  it('parses READY without capabilities (older worker)', () => {
    const msg = parseWorkerToMainMessage({ type: 'READY', protocolVersion: 1, width: 1, height: 2 })
    expect(msg).toEqual({ type: 'READY', protocolVersion: 1, width: 1, height: 2, capabilities: undefined })
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

