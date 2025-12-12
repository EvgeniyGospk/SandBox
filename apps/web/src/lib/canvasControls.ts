let resetCameraHandler: (() => void) | null = null

export function setResetCameraHandler(handler: (() => void) | null): void {
  resetCameraHandler = handler
}

export function resetCamera(): void {
  resetCameraHandler?.()
}

