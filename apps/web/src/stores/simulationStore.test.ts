import { describe, expect, it } from 'vitest'
import { getWorldSize } from './simulationStore'

describe('getWorldSize', () => {
  it('returns fixed preset dimensions', () => {
    expect(getWorldSize('tiny', { width: 999, height: 999 })).toEqual({ width: 256, height: 192 })
    expect(getWorldSize('medium', { width: 999, height: 999 })).toEqual({ width: 768, height: 576 })
  })

  it('returns viewport dimensions for full', () => {
    const viewport = { width: 123, height: 456 }
    expect(getWorldSize('full', viewport)).toBe(viewport)
  })
})

