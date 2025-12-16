export function initializeSharedInputBuffer(args: { buffer: Int32Array; overflowIndex: number }): void {
  const { buffer, overflowIndex } = args

  Atomics.store(buffer, 0, 0)
  Atomics.store(buffer, 1, 0)
  Atomics.store(buffer, overflowIndex, 0)
}
