/**
 * PowderBehavior - Physics for powder particles (sand, etc.)
 * Falls down, piles up, can sink into lighter liquids
 * 
 * Phase 1: Direct TypedArray access - no object allocations!
 */

import { IBehavior, UpdateContext, getGravityDirection, getRandomDirection } from './IBehavior'
import { ElementCategory, EL_EMPTY, CAT_LIQUID } from '../types'
import { ELEMENT_DATA, getCategoryById, getDensityById } from '../elements'

export class PowderBehavior implements IBehavior {
  readonly category: ElementCategory = 'powder'
  
  update(ctx: UpdateContext): void {
    const { grid, x, y, settings, frame } = ctx
    
    // Direct TypedArray access - no object creation!
    const type = grid.getType(x, y)
    if (type === EL_EMPTY) return
    
    const myDensity = ELEMENT_DATA[type].density
    const { gx, gy } = getGravityDirection(settings)
    
    // No gravity = no movement
    if (gy === 0 && gx === 0) return
    
    // Try to fall in gravity direction
    if (this.canDisplace(grid, x + gx, y + gy, myDensity)) {
      grid.swap(x, y, x + gx, y + gy)
      return
    }
    
    // Try diagonal movement
    const { dx1, dx2 } = getRandomDirection(frame, x)
    
    if (this.canDisplace(grid, x + dx1 + gx, y + gy, myDensity)) {
      grid.swap(x, y, x + dx1 + gx, y + gy)
      return
    }
    
    if (this.canDisplace(grid, x + dx2 + gx, y + gy, myDensity)) {
      grid.swap(x, y, x + dx2 + gx, y + gy)
    }
  }
  
  private canDisplace(grid: UpdateContext['grid'], x: number, y: number, myDensity: number): boolean {
    if (!grid.inBounds(x, y)) return false
    
    const targetType = grid.getType(x, y)
    if (targetType === EL_EMPTY) return true // Empty = can move
    
    const targetCat = getCategoryById(targetType)
    // Can only displace liquids, not solids
    if (targetCat !== CAT_LIQUID) return false
    
    return myDensity > getDensityById(targetType)
  }
}
