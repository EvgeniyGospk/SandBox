/**
 * IBehavior - Interface for particle behaviors
 * Open/Closed Principle: New behaviors can be added without modifying existing code
 */

import { IGrid } from '../core/Grid'
import { WorldSettings, ElementCategory } from '../types'

export interface UpdateContext {
  grid: IGrid
  x: number
  y: number
  settings: WorldSettings
  frame: number
}

export interface IBehavior {
  readonly category: ElementCategory
  update(ctx: UpdateContext): void
}

// Gravity helper used by multiple behaviors
export function getGravityDirection(settings: WorldSettings): { gx: number; gy: number } {
  return {
    gx: settings.gravity.x > 0 ? 1 : settings.gravity.x < 0 ? -1 : 0,
    gy: settings.gravity.y > 0 ? 1 : settings.gravity.y < 0 ? -1 : 0
  }
}

// Random direction helper
export function getRandomDirection(frame: number, x: number): { dx1: number; dx2: number } {
  const goLeft = (frame + x) & 1
  return {
    dx1: goLeft ? -1 : 1,
    dx2: goLeft ? 1 : -1
  }
}
