export function getElementAt(args: {
  typesView: Uint8Array | null
  width: number
  height: number
  x: number
  y: number
}): number {
  const { typesView, width, height, x, y } = args
  if (!typesView) return 0
  if (x < 0 || y < 0 || x >= width || y >= height) return 0
  return typesView[y * width + x] ?? 0
}
