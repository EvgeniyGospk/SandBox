export function checkOverflowFlag(args: { buffer: Int32Array; overflowIndex: number }): boolean {
  return Atomics.load(args.buffer, args.overflowIndex) === 1
}

export function clearOverflowFlag(args: { buffer: Int32Array; overflowIndex: number }): void {
  Atomics.store(args.buffer, args.overflowIndex, 0)
}

export function checkAndClearOverflowFlag(args: { buffer: Int32Array; overflowIndex: number }): boolean {
  return Atomics.exchange(args.buffer, args.overflowIndex, 0) === 1
}
