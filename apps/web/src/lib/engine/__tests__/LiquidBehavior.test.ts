/**
 * Tests for LiquidBehavior - Pure Dispersion Algorithm
 * Run with: npx vitest run
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Grid } from '../core/Grid'
import { LiquidBehavior } from '../behaviors/LiquidBehavior'
import { UpdateContext } from '../behaviors/IBehavior'
import { WorldSettings, Particle } from '../types'

// Test helper to create a particle
function createParticle(element: 'water' | 'oil' | 'lava'): Particle {
  return {
    element,
    color: 0xFF0000FF,
    updated: false,
    lifetime: 0
  }
}

// Test helper to create update context
function createContext(grid: Grid, x: number, y: number, frame: number = 0): UpdateContext {
  const settings: WorldSettings = {
    gravity: { x: 0, y: 9.8 },
    ambientTemperature: 20,
    speed: 1
  }
  return { grid, x, y, settings, frame }
}

describe('LiquidBehavior', () => {
  let grid: Grid
  let behavior: LiquidBehavior

  beforeEach(() => {
    grid = new Grid(20, 20)
    behavior = new LiquidBehavior()
  })

  describe('Falling', () => {
    it('should fall into empty space below', () => {
      grid.set(10, 5, createParticle('water'))
      
      behavior.update(createContext(grid, 10, 5))
      
      expect(grid.get(10, 5)).toBeNull()
      expect(grid.get(10, 6)).not.toBeNull()
      expect(grid.get(10, 6)?.element).toBe('water')
    })

    it('should fall diagonally if straight down is blocked', () => {
      grid.set(10, 5, createParticle('water'))
      grid.set(10, 6, createParticle('lava')) // lava is denser, can't displace
      
      behavior.update(createContext(grid, 10, 5))
      
      // Should have moved diagonally (9,6) or (11,6)
      const movedLeft = grid.get(9, 6) !== null
      const movedRight = grid.get(11, 6) !== null
      expect(movedLeft || movedRight).toBe(true)
    })
  })

  describe('Density layering', () => {
    it('should sink heavier liquid into lighter', () => {
      grid.set(10, 5, createParticle('lava')) // density 2500
      grid.set(10, 6, createParticle('oil')) // density 800
      
      behavior.update(createContext(grid, 10, 5))
      
      // Lava should have swapped with oil
      expect(grid.get(10, 5)?.element).toBe('oil')
      expect(grid.get(10, 6)?.element).toBe('lava')
    })

    it('should NOT sink lighter liquid into heavier', () => {
      grid.set(10, 5, createParticle('oil')) // density 800
      grid.set(10, 6, createParticle('lava')) // density 2500
      // Block ALL escape routes (including diagonals)
      grid.set(9, 5, createParticle('lava'))
      grid.set(11, 5, createParticle('lava'))
      grid.set(9, 6, createParticle('lava'))
      grid.set(11, 6, createParticle('lava'))
      
      behavior.update(createContext(grid, 10, 5))
      
      // Oil should stay on top (can't sink, can't spread)
      expect(grid.get(10, 5)?.element).toBe('oil')
      expect(grid.get(10, 6)?.element).toBe('lava')
    })
  })

  describe('Dispersion (Scan & Teleport)', () => {
    it('should teleport to cliff edge for waterfall effect', () => {
      // Water on a platform with cliffs at both ends
      //   [_][ ][ ][ ][W][ ][ ][ ][_]   <- water at 10, cliffs at x=6 and x=14
      //   [ ][=][=][=][=][=][=][=][ ]   <- solid platform from x=7 to x=13
      
      grid.set(10, 5, createParticle('water'))
      // Create solid platform below (block diagonals too)
      for (let x = 7; x <= 13; x++) {
        grid.set(x, 6, createParticle('lava'))
      }
      // Cliffs at x=6 and x=14 - empty below
      
      behavior.update(createContext(grid, 10, 5))
      
      // Water should teleport towards one of the cliffs (dispersion range is 8 for water)
      expect(grid.get(10, 5)).toBeNull()
      // Should have moved towards a cliff (including the cliff position itself)
      const foundLeft = [6, 7, 8, 9].find(x => grid.get(x, 5) !== null)
      const foundRight = [11, 12, 13, 14].find(x => grid.get(x, 5) !== null)
      expect(foundLeft !== undefined || foundRight !== undefined).toBe(true)
    })

    it('should spread sideways when resting on surface', () => {
      // Water on solid with empty space to sides
      grid.set(10, 10, createParticle('water'))
      // Block below AND diagonals AND far cliffs to force horizontal spread
      for (let x = 2; x <= 18; x++) {
        grid.set(x, 11, createParticle('lava'))
      }
      
      behavior.update(createContext(grid, 10, 10))
      
      // Should have spread somewhere (dispersion range is 8 for water)
      // Water should have moved from original position
      const waterMoved = grid.get(10, 10) === null
      expect(waterMoved).toBe(true)
    })

    it('should NOT spread if completely surrounded', () => {
      // Water completely surrounded (including diagonals)
      grid.set(10, 10, createParticle('water'))
      // All 8 neighbors
      grid.set(9, 9, createParticle('lava'))
      grid.set(10, 9, createParticle('lava'))
      grid.set(11, 9, createParticle('lava'))
      grid.set(9, 10, createParticle('lava'))
      grid.set(11, 10, createParticle('lava'))
      grid.set(9, 11, createParticle('lava'))
      grid.set(10, 11, createParticle('lava'))
      grid.set(11, 11, createParticle('lava'))
      
      behavior.update(createContext(grid, 10, 10))
      
      // Water should stay in place
      expect(grid.get(10, 10)?.element).toBe('water')
    })

    it('should respect dispersion rate (lava is slow)', () => {
      // Lava has dispersion: 2, so it should only scan 2 cells
      grid.set(10, 10, createParticle('lava'))
      // Block below AND diagonals
      grid.set(9, 11, createParticle('lava'))
      grid.set(10, 11, createParticle('lava'))
      grid.set(11, 11, createParticle('lava'))
      
      behavior.update(createContext(grid, 10, 10))
      
      // Lava should have moved, but only 1-2 cells
      const lavaPos = [8, 9, 10, 11, 12].find(x => grid.get(x, 10)?.element === 'lava')
      expect(lavaPos).toBeDefined()
      if (lavaPos !== 10) {
        expect(Math.abs(lavaPos! - 10)).toBeLessThanOrEqual(2)
      }
    })
  })

  describe('Prioritization', () => {
    it('should prefer falling over spreading', () => {
      // Water with both options: fall down or spread sideways
      grid.set(10, 5, createParticle('water'))
      // Leave both down and sides open
      
      behavior.update(createContext(grid, 10, 5))
      
      // Should have fallen, not spread
      expect(grid.get(10, 6)?.element).toBe('water')
      expect(grid.get(10, 5)).toBeNull()
    })

    it('should prefer cliff over flat spread', () => {
      // Water with cliff on right, flat on left
      grid.set(10, 5, createParticle('water'))
      grid.set(10, 6, createParticle('lava')) // blocked below
      // Create cliff on right (empty at x=12, y=6)
      grid.set(11, 6, createParticle('lava'))
      // x=12 has no floor - it's a cliff
      
      // Left side is flat (has floor all the way)
      for (let x = 5; x < 10; x++) {
        grid.set(x, 6, createParticle('lava'))
      }
      
      // Run several times to account for randomness
      let movedToCliff = false
      for (let i = 0; i < 20; i++) {
        grid.clear()
        grid.set(10, 5, createParticle('water'))
        grid.set(10, 6, createParticle('lava'))
        grid.set(11, 6, createParticle('lava'))
        for (let x = 5; x < 10; x++) {
          grid.set(x, 6, createParticle('lava'))
        }
        
        behavior.update(createContext(grid, 10, 5, i))
        
        // Check if moved towards cliff (right side)
        if (grid.get(11, 5) !== null || grid.get(12, 5) !== null) {
          movedToCliff = true
          break
        }
      }
      
      expect(movedToCliff).toBe(true)
    })
  })
})
