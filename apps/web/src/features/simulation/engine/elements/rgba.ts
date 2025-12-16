export function rgba(hex: string, alpha = 255): number {
  const num = parseInt(hex.replace('#', ''), 16)
  return (alpha << 24) | num
}
