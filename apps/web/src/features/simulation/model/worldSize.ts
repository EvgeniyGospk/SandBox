export type WorldSizePreset = 'tiny' | 'small' | 'medium' | 'large' | 'full'

export const WORLD_SIZE_PRESETS: Record<WorldSizePreset, { width: number; height: number } | 'viewport'> = {
  tiny: { width: 256, height: 192 },
  small: { width: 512, height: 384 },
  medium: { width: 768, height: 576 },
  large: { width: 1024, height: 768 },
  full: 'viewport',
}

export function getWorldSize(
  preset: WorldSizePreset,
  viewport: { width: number; height: number }
): { width: number; height: number } {
  const size = WORLD_SIZE_PRESETS[preset]
  if (size === 'viewport') return viewport
  return size
}
