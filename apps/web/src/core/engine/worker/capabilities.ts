export function isWorkerSupported(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  )
}

export function isSharedMemorySupported(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}
