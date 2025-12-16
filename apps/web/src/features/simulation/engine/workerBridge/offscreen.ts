export function transferCanvasToOffscreen(canvas: HTMLCanvasElement): OffscreenCanvas {
  return canvas.transferControlToOffscreen()
}
