import { describe, expect, it } from 'vitest'
import { SnapshotHistoryStore } from './SnapshotHistoryStore'

function makeSnapshot(value: number, bytes = 1): ArrayBuffer {
  const arr = new Uint8Array(bytes)
  arr.fill(value)
  return arr.buffer
}

function firstByte(buffer: ArrayBuffer): number {
  return new Uint8Array(buffer)[0] ?? 0
}

describe('SnapshotHistoryStore', () => {
  it('supports undo/redo with branching', () => {
    const store = new SnapshotHistoryStore({ maxEntries: 10 })
    store.captureUndoSnapshot(makeSnapshot(1))
    store.captureUndoSnapshot(makeSnapshot(2))
    store.captureUndoSnapshot(makeSnapshot(3))

    expect(store.canUndo).toBe(true)
    expect(store.canRedo).toBe(false)

    const undo1 = store.undoCopy()
    expect(undo1).not.toBeNull()
    expect(firstByte(undo1 as ArrayBuffer)).toBe(2)
    expect(store.canRedo).toBe(true)

    // Branch: capturing a new snapshot drops redo tail.
    store.captureUndoSnapshot(makeSnapshot(9))
    expect(store.canRedo).toBe(false)

    const undo2 = store.undoCopy()
    expect(undo2).not.toBeNull()
    expect(firstByte(undo2 as ArrayBuffer)).toBe(2)
  })

  it('enforces maxEntries', () => {
    const store = new SnapshotHistoryStore({ maxEntries: 3 })
    store.captureUndoSnapshot(makeSnapshot(1))
    store.captureUndoSnapshot(makeSnapshot(2))
    store.captureUndoSnapshot(makeSnapshot(3))
    store.captureUndoSnapshot(makeSnapshot(4))

    // Oldest (1) should be dropped; history becomes [2,3,4].
    expect(firstByte(store.undoCopy() as ArrayBuffer)).toBe(3)
    expect(firstByte(store.undoCopy() as ArrayBuffer)).toBe(2)
    expect(store.canUndo).toBe(false)
  })

  it('enforces maxBytes', () => {
    const store = new SnapshotHistoryStore({ maxEntries: 10, maxBytes: 3 })
    store.captureUndoSnapshot(makeSnapshot(1, 2)) // total = 2
    store.captureUndoSnapshot(makeSnapshot(2, 2)) // total = 4 -> should drop oldest

    expect(store.canUndo).toBe(false)
  })

  it('returns a copy for saved snapshot', () => {
    const store = new SnapshotHistoryStore()
    const original = makeSnapshot(7)
    store.setSavedSnapshot(original)

    const copy = store.getSavedSnapshotCopy()
    expect(copy).not.toBeNull()
    expect(copy).not.toBe(original)
    expect(firstByte(copy as ArrayBuffer)).toBe(7)
  })
})

