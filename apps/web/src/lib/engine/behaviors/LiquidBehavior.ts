/**
 * LiquidBehavior - Pure dispersion-based liquid physics
 * 
 * Phase 1: Direct TypedArray access - no object allocations!
 * 
 * Philosophy:
 * - No mass, no pressure formulas - just discrete particle movement
 * - Liquids "scan & teleport" up to N cells horizontally (dispersion rate)
 * - Prioritizes falling into holes/cliffs for waterfall effect
 * - Heavier liquids can push lighter ones horizontally for level equalization
 */

import { IBehavior, UpdateContext, getRandomDirection } from './IBehavior'
import { ElementCategory, EL_EMPTY, CAT_LIQUID, CAT_GAS } from '../types'
import { ELEMENT_DATA, getCategoryById, getDensityById } from '../elements'
import { IGrid } from '../core/Grid'

interface ScanResult {
  found: boolean
  x: number
  hasCliff: boolean
}

export class LiquidBehavior implements IBehavior {
  readonly category: ElementCategory = 'liquid'
  
  update(ctx: UpdateContext): void {
    const { grid, x, y, frame } = ctx
    
    // Direct TypedArray access - no object creation!
    const type = grid.getType(x, y)
    if (type === EL_EMPTY) return
    
    const props = ELEMENT_DATA[type]
    const density = props.density
    const range = props.dispersion || 5
    
    const { dx1, dx2 } = getRandomDirection(frame, x)
    
    // --- 1. Gravity: Fall Down ---
    if (this.tryMove(grid, x, y, x, y + 1, density)) return
    
    // --- 2. Gravity: Fall Diagonally ---
    if (this.tryMove(grid, x, y, x + dx1, y + 1, density)) return
    if (this.tryMove(grid, x, y, x + dx2, y + 1, density)) return
    
    // --- 3. Dispersion: Scan & Teleport ---
    const leftTarget = this.scanLine(grid, x, y, -1, range, density)
    const rightTarget = this.scanLine(grid, x, y, 1, range, density)
    
    // Choose best target
    let targetX = x
    
    if (leftTarget.found && rightTarget.found) {
      if (leftTarget.hasCliff && !rightTarget.hasCliff) {
        targetX = leftTarget.x
      } else if (!leftTarget.hasCliff && rightTarget.hasCliff) {
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
  
  private scanLine(
    grid: IGrid,
    startX: number,
    y: number,
    dir: number,
    range: number,
    myDensity: number
  ): ScanResult {
    let bestX = startX
    let found = false
    let hasCliff = false
    
    for (let i = 1; i <= range; i++) {
      const tx = startX + (dir * i)
      
      if (!grid.inBounds(tx, y)) break
      
      const targetType = grid.getType(tx, y)
      
      // CASE 1: Empty cell
      if (targetType === EL_EMPTY) {
        bestX = tx
        found = true
        
        // Check for cliff below (waterfall effect)
        if (grid.inBounds(tx, y + 1) && grid.isEmpty(tx, y + 1)) {
          hasCliff = true
          break
        }
        continue
      }
      
      // CASE 2: Occupied cell - check if we can displace
      const tCat = getCategoryById(targetType)
      
      if (tCat === CAT_LIQUID || tCat === CAT_GAS) {
        const tDensity = getDensityById(targetType)
        
        if (myDensity > tDensity) {
          bestX = tx
          found = true
          break
        }
      }
      
      // CASE 3: Wall or same/heavier liquid - stop scanning
      break
    }
    
    return { found, x: bestX, hasCliff }
  }
  
  private tryMove(
    grid: IGrid,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    myDensity: number
  ): boolean {
    if (!grid.inBounds(toX, toY)) return false
    
    const targetType = grid.getType(toX, toY)
    
    // Empty cell - just move
    if (targetType === EL_EMPTY) {
      grid.swap(fromX, fromY, toX, toY)
      return true
    }
    
    // Check if we can displace (heavier sinks into lighter)
    const tCat = getCategoryById(targetType)
    if (tCat === CAT_LIQUID || tCat === CAT_GAS) {
      if (myDensity > getDensityById(targetType)) {
        grid.swap(fromX, fromY, toX, toY)
        return true
      }
    }
    
    return false
  }
}
