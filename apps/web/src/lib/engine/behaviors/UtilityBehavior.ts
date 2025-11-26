/**
 * UtilityBehavior - Handles Clone and Void elements
 * Clone: Duplicates touching elements into empty neighbors
 * Void: Destroys all touching elements
 * 
 * Phase 1: Direct TypedArray access - no object allocations!
 */

import { IBehavior, UpdateContext } from './IBehavior'
import { 
  ElementCategory, 
  ElementId,
  EL_EMPTY, 
  EL_CLONE, 
  EL_VOID,
  CAT_UTILITY
} from '../types'
import { ELEMENT_DATA, getCategoryById, getColorById } from '../elements'
import { IGrid } from '../core/Grid'

export class UtilityBehavior implements IBehavior {
  readonly category: ElementCategory = 'utility'

  update(ctx: UpdateContext): void {
    const { grid, x, y, frame } = ctx
    
    // Direct TypedArray access - no object creation!
    const type = grid.getType(x, y)
    if (type === EL_EMPTY) return

    if (type === EL_VOID) {
      this.processVoid(grid, x, y)
    } else if (type === EL_CLONE) {
      this.processClone(grid, x, y, frame)
    }
  }

  /**
   * VOID: Destroys all adjacent particles (except other utilities)
   */
  private processVoid(grid: IGrid, x: number, y: number): void {
    const neighbors = [
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y }
    ]

    for (const { nx, ny } of neighbors) {
      if (!grid.inBounds(nx, ny)) continue
      
      const neighborType = grid.getType(nx, ny)
      if (neighborType !== EL_EMPTY && neighborType !== EL_VOID && neighborType !== EL_CLONE) {
        grid.clearCell(nx, ny)
      }
    }
  }

  /**
   * CLONE: Finds a donor element and copies it to empty adjacent cells
   */
  private processClone(grid: IGrid, x: number, y: number, frame: number): void {
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ]

    // 1. Find a donor element (first non-utility neighbor)
    let sourceType: ElementId = EL_EMPTY
    
    for (const dir of directions) {
      const nx = x + dir.dx
      const ny = y + dir.dy
      
      if (!grid.inBounds(nx, ny)) continue
      
      const neighborType = grid.getType(nx, ny)
      if (neighborType !== EL_EMPTY) {
        const cat = getCategoryById(neighborType)
        if (cat !== CAT_UTILITY) {
          sourceType = neighborType
          break
        }
      }
    }

    if (sourceType === EL_EMPTY) return  // No donor found

    // 2. Clone into ONE empty adjacent cell
    const startDir = frame % 4
    
    for (let i = 0; i < 4; i++) {
      const dir = directions[(startDir + i) % 4]
      const nx = x + dir.dx
      const ny = y + dir.dy
      
      if (!grid.inBounds(nx, ny)) continue
      if (!grid.isEmpty(nx, ny)) continue
      
      // Create cloned particle using direct TypedArray writes
      const seed = (nx * 7 + ny * 13 + frame) & 31
      const props = ELEMENT_DATA[sourceType]
      
      grid.setParticle(
        nx, ny,
        sourceType,
        getColorById(sourceType, seed),
        props.lifetime,
        props.defaultTemp
      )
      return  // Only clone ONE per frame!
    }
  }
}
