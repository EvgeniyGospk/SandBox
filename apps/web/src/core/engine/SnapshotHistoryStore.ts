export type SnapshotHistoryOptions = {
  maxEntries?: number
  maxBytes?: number
}

export class SnapshotHistoryStore {
  private savedSnapshot: ArrayBuffer | null = null
  private history: ArrayBuffer[] = []
  private historyIndex = -1
  private totalBytes = 0

  private readonly maxEntries: number
  private readonly maxBytes: number

  constructor(options: SnapshotHistoryOptions = {}) {
    this.maxEntries = options.maxEntries ?? 20
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024
  }

  setSavedSnapshot(snapshot: ArrayBuffer | null): void {
    this.savedSnapshot = snapshot
  }

  getSavedSnapshotCopy(): ArrayBuffer | null {
    return this.savedSnapshot ? this.savedSnapshot.slice(0) : null
  }

  clear(): void {
    this.savedSnapshot = null
    this.history = []
    this.historyIndex = -1
    this.totalBytes = 0
  }

  get canUndo(): boolean {
    return this.historyIndex > 0
  }

  get canRedo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1
  }

  captureUndoSnapshot(snapshot: ArrayBuffer): void {
    // Drop redo tail if we branched.
    if (this.historyIndex < this.history.length - 1) {
      const dropped = this.history.splice(this.historyIndex + 1)
      for (const buf of dropped) this.totalBytes -= buf.byteLength
    }

    this.history.push(snapshot)
    this.totalBytes += snapshot.byteLength
    this.historyIndex = this.history.length - 1

    this.enforceLimits()
  }

  undoCopy(): ArrayBuffer | null {
    if (!this.canUndo) return null
    this.historyIndex -= 1
    return this.history[this.historyIndex]?.slice(0) ?? null
  }

  redoCopy(): ArrayBuffer | null {
    if (!this.canRedo) return null
    this.historyIndex += 1
    return this.history[this.historyIndex]?.slice(0) ?? null
  }

  private enforceLimits(): void {
    while (this.history.length > this.maxEntries || this.totalBytes > this.maxBytes) {
      const removed = this.history.shift()
      if (removed) this.totalBytes -= removed.byteLength
      this.historyIndex -= 1
    }

    if (this.historyIndex < 0 && this.history.length > 0) {
      this.historyIndex = 0
    }
  }
}

