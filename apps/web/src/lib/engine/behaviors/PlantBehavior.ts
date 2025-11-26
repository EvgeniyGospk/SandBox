/**
 * PlantBehavior - Agent-based plant growth system
 * 
 * Phase 1: Direct TypedArray access - no object allocations!
 * 
 * Seed: Falls like powder, germinates when touching dirt + water
 * Plant: Grows upward consuming water, affected by temperature
 */

import { IBehavior, UpdateContext, getRandomDirection } from './IBehavior'
import { 
  ElementCategory, 
  EL_EMPTY, 
  EL_SEED, 
  EL_PLANT, 
  EL_WATER, 
  EL_DIRT, 
  EL_SAND,
  CAT_LIQUID
} from '../types'
import { ELEMENT_DATA, getCategoryById, getDensityById, getColorById } from '../elements'
import { IGrid } from '../core/Grid'

const SEED_DENSITY = 1100

export class PlantBehavior implements IBehavior {
  readonly category: ElementCategory = 'bio'

  update(ctx: UpdateContext): void {
    const { grid, x, y } = ctx
    
    // Direct TypedArray access - no object creation!
    const type = grid.getType(x, y)
    if (type === EL_EMPTY) return

    if (type === EL_SEED) {
      this.processSeed(ctx)
    } else if (type === EL_PLANT) {
      this.processPlant(ctx)
    }
  }

  private processSeed(ctx: UpdateContext): void {
    const { grid, x, y, frame } = ctx
    
    // 1. Gravity - fall down
    if (this.canSeedDisplace(grid, x, y + 1)) {
      grid.swap(x, y, x, y + 1)
      return
    }
    
    // 2. Diagonal falling
    const { dx1, dx2 } = getRandomDirection(frame, x)
    if (this.canSeedDisplace(grid, x + dx1, y + 1)) {
      grid.swap(x, y, x + dx1, y + 1)
      return
    }
    if (this.canSeedDisplace(grid, x + dx2, y + 1)) {
      grid.swap(x, y, x + dx2, y + 1)
      return
    }

    // 3. Germination check
    const belowType = grid.getType(x, y + 1)
    if (belowType === EL_DIRT || belowType === EL_SAND) {
      if (this.hasWaterNeighbor(grid, x, y)) {
        this.transformToPlant(ctx, x, y)
      }
    }
  }
  
  private canSeedDisplace(grid: IGrid, x: number, y: number): boolean {
    if (!grid.inBounds(x, y)) return false
    
    const targetType = grid.getType(x, y)
    if (targetType === EL_EMPTY) return true
    
    const targetCat = getCategoryById(targetType)
    if (targetCat === CAT_LIQUID) {
      return SEED_DENSITY > getDensityById(targetType)
    }
    
    return false
  }

  private processPlant(ctx: UpdateContext): void {
    const { grid, x, y } = ctx
    
    const temp = grid.getTemp(x, y)
    
    if (temp < 0) return
    
    if (temp > 150) {
      grid.clearCell(x, y)
      return
    }

    if (Math.random() > 0.05) return

    const canGrowUp = grid.inBounds(x, y - 1) && grid.isEmpty(x, y - 1)
    
    if (!canGrowUp) {
      if (Math.random() > 0.2) return
    }

    const waterPos = this.findWater(grid, x, y, 3)
    
    if (waterPos) {
      grid.clearCell(waterPos.x, waterPos.y)
      
      const growOptions = [
        { dx: 0, dy: -1 },
        { dx: -1, dy: -1 },
        { dx: 1, dy: -1 },
      ]
      
      const weights = [0.6, 0.2, 0.2]
      const rand = Math.random()
      let cumulative = 0
      let chosen = growOptions[0]
      
      for (let i = 0; i < growOptions.length; i++) {
        cumulative += weights[i]
        if (rand < cumulative) {
          chosen = growOptions[i]
          break
        }
      }
      
      const gx = x + chosen.dx
      const gy = y + chosen.dy
      
      if (grid.inBounds(gx, gy) && grid.isEmpty(gx, gy)) {
        this.transformToPlant(ctx, gx, gy)
      }
    }
  }

  private transformToPlant(ctx: UpdateContext, x: number, y: number): void {
    const { grid, frame } = ctx
    const seed = (x * 11 + y * 17 + frame) & 31
    const props = ELEMENT_DATA[EL_PLANT]
    
    grid.setParticle(
      x, y,
      EL_PLANT,
      getColorById(EL_PLANT, seed),
      props.lifetime,
      20  // Room temperature
    )
  }

  private hasWaterNeighbor(grid: IGrid, x: number, y: number): boolean {
    return this.findWater(grid, x, y, 1) !== null
  }

  private findWater(grid: IGrid, cx: number, cy: number, radius: number): { x: number; y: number } | null {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if (grid.inBounds(nx, ny)) {
          if (grid.getType(nx, ny) === EL_WATER) {
            return { x: nx, y: ny }
          }
        }
      }
    }
    return null
  }
}
