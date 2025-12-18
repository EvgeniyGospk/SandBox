import { describe, expect, it, vi } from 'vitest'
import { installWorkerHandlers } from './handlers'
import { parseWorkerToMainMessage } from '../protocol'

function createWorkerStub(): Worker {
  return {
    onmessage: null,
    onmessageerror: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker
}

describe('installWorkerHandlers', () => {
  it('forwards STATS object including optional fields', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({
      data: {
        type: 'STATS',
        fps: 60,
        particleCount: 123,
        stepsPerFrame: 2,
        inputOverflowCount: 5,
        wasmMemoryBytes: 1024,
      },
    } as MessageEvent)

    expect(onStats).toHaveBeenCalledWith({
      type: 'STATS',
      fps: 60,
      particleCount: 123,
      stepsPerFrame: 2,
      inputOverflowCount: 5,
      wasmMemoryBytes: 1024,
    })

    expect(onUnknownMessage).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
  })

  it('treats unknown/invalid messages as protocol errors and destroys worker', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: () => null,
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { nonsense: true } } as MessageEvent)

    expect(onUnknownMessage).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('Worker protocol error: unknown or invalid message')
    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)

    expect(onReady).not.toHaveBeenCalled()
    expect(resolveInit).not.toHaveBeenCalled()
  })

  it('destroys worker on unknown message type in strict mode', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      unknownMessageMode: 'strict',
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { type: 'FUTURE_MESSAGE', foo: 1 } } as MessageEvent)

    expect(onUnknownMessage).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('Worker protocol error: unknown message type')
    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps worker alive on ERROR when errorBehavior=keep', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      errorBehavior: 'keep',
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { type: 'ERROR', message: 'bad' } } as MessageEvent)

    expect(onError).toHaveBeenCalledWith('bad')
    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('does not destroy worker on recoverable CRASH when crashBehavior=terminateIfUnrecoverable', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      crashBehavior: 'terminateIfUnrecoverable',
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { type: 'CRASH', message: 'boom', canRecover: true } } as MessageEvent)

    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(onCrash).toHaveBeenCalledWith('boom', true)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('destroys worker on unrecoverable CRASH when crashBehavior=terminateIfUnrecoverable', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      crashBehavior: 'terminateIfUnrecoverable',
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { type: 'CRASH', message: 'boom', canRecover: false } } as MessageEvent)

    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(onCrash).toHaveBeenCalledWith('boom', false)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('ignores unknown message type in lenient mode', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      unknownMessageMode: 'lenient',
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { type: 'FUTURE_MESSAGE', foo: 1 } } as MessageEvent)

    expect(onUnknownMessage).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(resolveAllPendingRequests).not.toHaveBeenCalled()
    expect(rejectInitIfPending).not.toHaveBeenCalled()
    expect(destroy).not.toHaveBeenCalled()
  })

  it('rejects init and destroys worker on READY protocol version mismatch', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({
      data: {
        type: 'READY',
        protocolVersion: 2,
        width: 10,
        height: 10,
      },
    } as MessageEvent)

    expect(onError).toHaveBeenCalledWith('Worker protocol mismatch (expected 1, got 2)')
    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(rejectInit).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)

    expect(onReady).not.toHaveBeenCalled()
    expect(resolveInit).not.toHaveBeenCalled()
    expect(rejectInitIfPending).not.toHaveBeenCalled()
  })

  it('resolves init on READY and does not destroy worker', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({
      data: {
        type: 'READY',
        protocolVersion: 1,
        width: 10,
        height: 20,
        extraField: 'ignored',
      },
    } as MessageEvent)

    expect(onReady).toHaveBeenCalledWith(10, 20)
    expect(resolveInit).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(resolveAllPendingRequests).not.toHaveBeenCalled()
    expect(rejectInit).not.toHaveBeenCalled()
    expect(rejectInitIfPending).not.toHaveBeenCalled()
  })

  it('destroys worker on message deserialization errors', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessageerror?.(new MessageEvent('messageerror'))

    expect(onError).toHaveBeenCalledWith('Worker message deserialization error')
    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys worker on CRASH and rejects init if pending', () => {
    const worker = createWorkerStub()

    const onUnknownMessage = vi.fn()
    const onReady = vi.fn()
    const onStats = vi.fn()
    const onError = vi.fn()
    const onCrash = vi.fn()
    const onPipetteResult = vi.fn()
    const onSnapshotResult = vi.fn()

    const resolveAllPendingRequests = vi.fn()
    const destroy = vi.fn()

    const resolveInit = vi.fn()
    const rejectInit = vi.fn()
    const rejectInitIfPending = vi.fn()

    installWorkerHandlers({
      worker,
      expectedProtocolVersion: 1,
      parseMessage: parseWorkerToMainMessage,
      onUnknownMessage,
      onReady,
      onStats,
      onError,
      onCrash,
      onPipetteResult,
      onSnapshotResult,
      resolveAllPendingRequests,
      destroy,
      resolveInit,
      rejectInit,
      rejectInitIfPending,
    })

    worker.onmessage?.({ data: { type: 'CRASH', message: 'boom', canRecover: false } } as MessageEvent)

    expect(resolveAllPendingRequests).toHaveBeenCalledTimes(1)
    expect(onCrash).toHaveBeenCalledWith('boom', false)
    expect(rejectInitIfPending).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)

    expect(onError).not.toHaveBeenCalled()
    expect(resolveInit).not.toHaveBeenCalled()
    expect(rejectInit).not.toHaveBeenCalled()
  })
})
