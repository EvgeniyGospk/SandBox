export function setupContextLossHandlers(
  canvas: OffscreenCanvas,
  handlers: {
    onContextLost: () => void
    onContextRestored: () => void
  }
): void {
  // Note: OffscreenCanvas uses different event names
  canvas.addEventListener(
    'webglcontextlost',
    ((e: Event) => {
      e.preventDefault()
      handlers.onContextLost()
    }) as EventListener
  )

  canvas.addEventListener(
    'webglcontextrestored',
    (() => {
      handlers.onContextRestored()
    }) as EventListener
  )
}
