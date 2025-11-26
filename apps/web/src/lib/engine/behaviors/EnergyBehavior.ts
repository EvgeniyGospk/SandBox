/**
 * EnergyBehavior - Physics for energy particles (fire, spark, electricity)
 * Fire rises erratically, spark/electricity move through conductors
 * 
 * Phase 1: Direct TypedArray access - no object allocations!
 */

import { IBehavior, UpdateContext } from './IBehavior'
import { ElementCategory, EL_EMPTY, EL_FIRE, EL_SPARK, EL_ELECTRICITY } from '../types'

export class EnergyBehavior implements IBehavior {
  readonly category: ElementCategory = 'energy'
  
  update(ctx: UpdateContext): void {
    const { grid, x, y } = ctx
    
    // Direct TypedArray access - no object creation!
    const type = grid.getType(x, y)
    if (type === EL_EMPTY) return
    
    switch (type) {
      case EL_FIRE:
        this.updateFire(ctx)
        break
      case EL_SPARK:
        this.updateSpark(ctx)
        break
      case EL_ELECTRICITY:
        this.updateElectricity(ctx)
        break
    }
  }
  
  private updateFire(ctx: UpdateContext): void {
    const { grid, x, y, frame } = ctx
    
    // Fire rises erratically
    const rand = (frame * x * y) & 3
    
    if (rand === 0 && grid.isEmpty(x, y - 1)) {
      grid.swap(x, y, x, y - 1)
    } else if (rand === 1 && grid.isEmpty(x - 1, y - 1)) {
      grid.swap(x, y, x - 1, y - 1)
    } else if (rand === 2 && grid.isEmpty(x + 1, y - 1)) {
      grid.swap(x, y, x + 1, y - 1)
    }
  }
  
  private updateSpark(_ctx: UpdateContext): void {
    // Spark is handled by lifetime, no movement needed
  }
  
  private updateElectricity(_ctx: UpdateContext): void {
    // Electricity is handled by lifetime
  }
}
