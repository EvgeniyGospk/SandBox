export function terminateWorker(worker: Worker | null): void {
  if (!worker) return
  worker.onmessage = null
  worker.onerror = null
  worker.onmessageerror = null
  worker.terminate()
}
