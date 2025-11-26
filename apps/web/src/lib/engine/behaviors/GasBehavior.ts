/**
 * GasBehavior - Pure dispersion-based gas physics
 * 
 * Phase 1: Direct TypedArray access - no object allocations!
 * 
 * Philosophy:
 * - Gases are "inverted liquids" - they rise instead of fall
 * - Scan & teleport horizontally to find "chimneys" (openings above)
 * - Can bubble up through liquids and powders (density-based)
 */

import { IBehavior, UpdateContext, getRandomDirection } from './IBehavior'
import { ElementCategory, EL_EMPTY, CAT_SOLID } from '../types'
import { ELEMENT_DATA, getCategoryById, getDensityById } from '../elements'
import { IGrid } from '../core/Grid'

interface ScanResult {
  found: boolean
  x: number
  hasChimney: boolean
}

export class GasBehavior implements IBehavior {
  readonly category: ElementCategory = 'gas'
  
  update(ctx: UpdateContext): void {
    const { grid, x, y, frame } = ctx
    
    // Direct TypedArray access - no object creation!
    const type = grid.getType(x, y)
    if (type === EL_EMPTY) return
    
    const props = ELEMENT_DATA[type]
    const density = props.density
    const range = props.dispersion || 5
    
    const { dx1, dx2 } = getRandomDirection(frame, x)
    
    // --- 1. Rise UP (against gravity) ---
    if (this.tryRise(grid, x, y, x, y - 1, density)) return
    
    // --- 2. Rise DIAGONALLY ---
    if (this.tryRise(grid, x, y, x + dx1, y - 1, density)) return
    if (this.tryRise(grid, x, y, x + dx2, y - 1, density)) return
    
    // --- 3. Dispersion: Scan ceiling for chimneys ---
    const leftTarget = this.scanCeiling(grid, x, y, -1, range, density)
    const rightTarget = this.scanCeiling(grid, x, y, 1, range, density)
    
    let targetX = x
    
    if (leftTarget.found && rightTarget.found) {
      if (leftTarget.hasChimney && !rightTarget.hasChimney) {
        targetX = leftTarget.x
      } else if (!leftTarget.hasChimney && rightTarget.hasChimney) {
        targetX = rightTarget.x
      } else {
        targetX = Math.random() < 0.5 ? leftTarget.x : rightTarget.x
      }
    } else if (leftTarget.found) {
      targetX = leftTarget.x
    } else if (rightTarget.found) {
      targetX = rightTarget.x
    }
    
    if (targetX !== x) {
      grid.swap(x, y, targetX, y)
    }
  }
  
  private scanCeiling(
    grid: IGrid,
    startX: number,
    y: number,
    dir: number,
    range: number,
    myDensity: number
  ): ScanResult {
    let bestX = startX
    let found = false
    let hasChimney = false
    
    for (let i = 1; i <= range; i++) {
      const tx = startX + (dir * i)
      
      if (!grid.inBounds(tx, y)) break
      
      const targetType = grid.getType(tx, y)
      
      // CASE 1: Empty cell
      if (targetType === EL_EMPTY) {
        bestX = tx
        found = true
        
        // Check for chimney above
        if (grid.inBounds(tx, y - 1)) {
          const aboveType = grid.getType(tx, y - 1)
          if (aboveType === EL_EMPTY || getDensityById(aboveType) > myDensity) {
            hasChimney = true
            break
          }
        }
        continue
      }
      
      // CASE 2: Occupied - can we displace it?
      const tCat = getCategoryById(targetType)
      
      if (tCat !== CAT_SOLID) {
        const tDensity = getDensityById(targetType)
        if (tDensity > myDensity) {
          bestX = tx
          found = true
          break
        }
      }
      
      // CASE 3: Wall or lighter/same gas - stop
      break
    }
    
    return { found, x: bestX, hasChimney }
  }
  
  private tryRise(
    grid: IGrid,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    myDensity: number
  ): boolean {
    if (!grid.inBounds(toX, toY)) return false
    
    const targetType = grid.getType(toX, toY)
    
    // Empty cell - just rise
    if (targetType === EL_EMPTY) {
      grid.swap(fromX, fromY, toX, toY)
      return true
    }
    
    // Can we bubble through? (target must be heavier and not solid)
    const tCat = getCategoryById(targetType)
    
    if (tCat !== CAT_SOLID) {
      const tDensity = getDensityById(targetType)
      if (tDensity > myDensity) {
        grid.swap(fromX, fromY, toX, toY)
        return true
      }
    }
    
    return false
  }
}
