/**
 * Simulation - Orchestrates particle physics
 * Single Responsibility: Manages simulation step, delegates physics to behaviors
 * Open/Closed: New behaviors can be added without modifying this class
 */

import { ISimulation, Particle, ElementType, WorldSettings, ElementCategory, ELEMENT_ID_TO_NAME, EL_EMPTY } from '../types'
import { ELEMENTS, getColorWithVariation, getElementCategory } from '../elements'
import { REACTIONS, Reaction } from '../reactions'
import { Grid } from './Grid'
import { 
  IBehavior, 
  UpdateContext,
  PowderBehavior, 
  LiquidBehavior, 
  GasBehavior, 
  EnergyBehavior,
  UtilityBehavior,
  PlantBehavior
} from '../behaviors'

export class Simulation implements ISimulation {
  private grid: Grid
  private frame: number = 0
  private settings: WorldSettings
  private _particleCount: number = 0
  
  // Behavior registry - maps category to behavior handler
  private behaviors: Map<ElementCategory, IBehavior>
  
  constructor(width: number, height: number) {
    this.grid = new Grid(width, height)
    this.settings = {
      gravity: { x: 0, y: 0.5 },
      ambientTemperature: 20,
      speed: 1,
    }
    
    // Register behaviors (OCP: add new behaviors here)
    this.behaviors = new Map<ElementCategory, IBehavior>([
      ['powder', new PowderBehavior()],
      ['liquid', new LiquidBehavior()],
      ['gas', new GasBehavior()],
      ['energy', new EnergyBehavior()],
      ['utility', new UtilityBehavior()],
      ['bio', new PlantBehavior()],
    ])
  }
  
  // Public API
  get width(): number { return this.grid.width }
  get height(): number { return this.grid.height }
  get particleCount(): number { return this._particleCount }
  
  // Legacy method - creates objects, USE SPARINGLY!
  getGrid(): (Particle | null)[] { 
    return this.grid.getCells() 
  }
  
  // NEW: Direct TypedArray access - ZERO allocations!
  getTypesArray(): Uint8Array {
    return this.grid.types
  }
  
  getColorsArray(): Uint32Array {
    return this.grid.colors
  }
  
  getTemperatureArray(): Float32Array {
    return this.grid.temperature
  }
  
  setSettings(settings: Partial<WorldSettings>): void {
    Object.assign(this.settings, settings)
  }
  
  // Particle management
  addParticle(x: number, y: number, element: ElementType): boolean {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    
    if (!this.grid.inBounds(ix, iy)) return false
    if (this.grid.get(ix, iy)) return false // Occupied
    
    const seed = (ix * 7 + iy * 13 + this.frame) & 31
    const particle: Particle = {
      element,
      color: getColorWithVariation(element, seed),
      updated: false,
      lifetime: ELEMENTS[element].lifetime,
    }
    
    this.grid.set(ix, iy, particle)
    this.grid.setTemp(ix, iy, ELEMENTS[element].defaultTemp)  // Set temperature!
    this._particleCount++
    
    return true
  }
  
  addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType): void {
    const r2 = radius * radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          this.addParticle(cx + dx, cy + dy, element)
        }
      }
    }
  }
  
  removeParticle(x: number, y: number): boolean {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    
    if (!this.grid.inBounds(ix, iy)) return false
    
    if (this.grid.get(ix, iy)) {
      this.grid.set(ix, iy, null)
      this._particleCount--
      return true
    }
    return false
  }
  
  removeParticlesInRadius(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          this.removeParticle(cx + dx, cy + dy)
        }
      }
    }
  }
  
  clear(): void {
    this.grid.clear()
    this._particleCount = 0
    this.frame = 0
  }
  
  resize(width: number, height: number): void {
    this.grid.resize(width, height)
    
    // Recount particles
    this._particleCount = 0
    this.grid.forEach((p) => {
      if (p) this._particleCount++
    })
  }
  
  // Main simulation step
  step(): void {
    // Reset update flags - use TypedArray method, not legacy forEach!
    this.grid.resetUpdated()
    
    // Process based on gravity direction
    // Alternate left-right processing to prevent directional bias
    const goRight = (this.frame & 1) === 0
    const gravityDown = this.settings.gravity.y >= 0
    
    // Process from bottom to top (or top to bottom if gravity reversed)
    // This ensures lower particles move first, freeing space for upper ones
    if (gravityDown) {
      for (let y = this.grid.height - 1; y >= 0; y--) {
        this.processRow(y, goRight)
      }
    } else {
      for (let y = 0; y < this.grid.height; y++) {
        this.processRow(y, goRight)
      }
    }
    
    // Thermodynamics pass - run every other frame for performance
    if (this.frame % 2 === 0) {
      this.processTemperatureGrid()
    }
    
    this.frame++
  }
  
  /**
   * Process temperature for entire grid (including air!)
   * Uses stochastic approach - only check one random neighbor per cell
   */
  private processTemperatureGrid(): void {
    const h = this.grid.height
    const w = this.grid.width
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.updateTemperature(x, y)
      }
    }
  }
  
  /**
   * Heat transfer using Newton's law of cooling (simplified)
   * Stochastic: only check ONE random neighbor for performance
   * Phase 1: Uses TypedArray access
   */
  private updateTemperature(x: number, y: number): void {
    const myTemp = this.grid.getTemp(x, y)
    const type = this.grid.getType(x, y)
    
    // Empty cells (air) tend towards ambient temperature
    if (type === EL_EMPTY) {
      const ambient = this.settings.ambientTemperature
      const diff = ambient - myTemp
      
      if (Math.abs(diff) > 0.5) {
        this.grid.setTemp(x, y, myTemp + diff * 0.02)
      }
    }
    
    // Get conductivity (air = 5 if empty)
    const conductivity = type !== EL_EMPTY 
      ? ELEMENTS[ELEMENT_ID_TO_NAME[type]].heatConductivity 
      : 5
    
    // Skip if insulator (conductivity 0)
    if (conductivity === 0) return
    
    // Pick random neighbor direction
    const dir = Math.floor(Math.random() * 4)
    let nx = x, ny = y
    if (dir === 0) ny--      // Up
    else if (dir === 1) ny++ // Down
    else if (dir === 2) nx-- // Left
    else nx++                // Right
    
    // Boundary: heat sink to ambient temperature
    if (!this.grid.inBounds(nx, ny)) {
      const ambient = this.settings.ambientTemperature
      const diff = ambient - myTemp
      // Slow heat loss at edges
      this.grid.setTemp(x, y, myTemp + diff * 0.02)
      return
    }
    
    // Heat transfer with neighbor
    const neighborTemp = this.grid.getTemp(nx, ny)
    const diff = neighborTemp - myTemp
    
    // Optimization: skip if temperature difference is negligible
    if (Math.abs(diff) < 0.5) return
    
    // Transfer rate based on conductivity (0-100 → 0.0-0.5)
    const transferRate = (conductivity / 100) * 0.5
    
    // Exchange heat (conservation of energy)
    this.grid.setTemp(x, y, myTemp + diff * transferRate)
    this.grid.setTemp(nx, ny, neighborTemp - diff * transferRate)
    
    // Check phase changes for particles
    if (type !== EL_EMPTY) {
      this.checkPhaseChangeTyped(x, y, type, myTemp + diff * transferRate)
    }
  }
  
  /**
   * Check if particle should change phase based on temperature
   * Phase 1: Uses TypedArray access
   */
  private checkPhaseChangeTyped(x: number, y: number, type: number, temp: number): void {
    const props = ELEMENTS[ELEMENT_ID_TO_NAME[type]]
    if (!props.phaseChange) return
    
    // Check overheating (melting/boiling)
    if (props.phaseChange.high && temp > props.phaseChange.high.temp) {
      // Convert numeric ID to string ElementType
      const newElement = ELEMENT_ID_TO_NAME[props.phaseChange.high.to]
      if (newElement) this.transformParticle(x, y, newElement, temp)
      return
    }
    
    // Check overcooling (freezing/solidifying)
    if (props.phaseChange.low && temp < props.phaseChange.low.temp) {
      const newElement = ELEMENT_ID_TO_NAME[props.phaseChange.low.to]
      if (newElement) this.transformParticle(x, y, newElement, temp)
    }
  }
  
  /**
   * Transform particle to new element, preserving temperature
   */
  private transformParticle(x: number, y: number, newElement: ElementType, temp: number): void {
    const seed = (x * 7 + y * 13 + this.frame) & 31
    const newParticle: Particle = {
      element: newElement,
      color: getColorWithVariation(newElement, seed),
      updated: true,
      lifetime: ELEMENTS[newElement].lifetime,
    }
    this.grid.set(x, y, newParticle)
    // Keep temperature! Hot stone from lava stays hot
    this.grid.setTemp(x, y, temp)
  }
  
  private processRow(y: number, goRight: boolean): void {
    const w = this.grid.width
    
    if (goRight) {
      for (let x = 0; x < w; x++) {
        this.updateParticle(x, y)
      }
    } else {
      for (let x = w - 1; x >= 0; x--) {
        this.updateParticle(x, y)
      }
    }
  }
  
  private updateParticle(x: number, y: number): void {
    // Direct TypedArray access - no object creation!
    const type = this.grid.getType(x, y)
    if (type === EL_EMPTY) return
    if (this.grid.isUpdated(x, y)) return
    
    this.grid.setUpdated(x, y, true)
    
    // Handle lifetime
    const life = this.grid.getLife(x, y)
    if (life > 0) {
      this.grid.setLife(x, y, life - 1)
      if (life - 1 <= 0) {
        this.grid.clearCell(x, y)
        this._particleCount--
        return
      }
    }
    
    // Get behavior for this category using numeric ID
    const category = getElementCategory(ELEMENT_ID_TO_NAME[type])
    const behavior = this.behaviors.get(category)
    
    if (behavior) {
      const ctx: UpdateContext = {
        grid: this.grid,
        x,
        y,
        settings: this.settings,
        frame: this.frame
      }
      behavior.update(ctx)
    }
    
    // Process chemical reactions AFTER movement
    const currentType = this.grid.getType(x, y)
    if (currentType !== EL_EMPTY) {
      this.processReactionsTyped(x, y, currentType)
    }
  }
  
  /**
   * Process chemical reactions using TypedArrays
   * Direct numeric ID access - no object creation!
   */
  private processReactionsTyped(x: number, y: number, type: number): void {
    // Convert numeric ID to string for REACTIONS lookup (legacy compatibility)
    const elementName = ELEMENT_ID_TO_NAME[type]
    const myReactions = REACTIONS[elementName]
    if (!myReactions) return
    
    // Pick a random neighbor
    const dir = Math.floor(Math.random() * 4)
    let nx = x, ny = y
    
    if (dir === 0) ny--
    else if (dir === 1) ny++
    else if (dir === 2) nx--
    else nx++
    
    if (!this.grid.inBounds(nx, ny)) return
    
    const neighborType = this.grid.getType(nx, ny)
    if (neighborType === EL_EMPTY) return
    
    // Check if there's a reaction rule for this neighbor
    const neighborName = ELEMENT_ID_TO_NAME[neighborType]
    const reaction = myReactions[neighborName]
    if (!reaction) return
    
    // Roll the dice
    if (Math.random() > reaction.chance) return
    
    // Apply the reaction
    this.applyReaction(x, y, nx, ny, reaction)
  }
  
  /**
   * Apply a bilateral reaction between source and target
   * Both particles can be transformed (fixes "infinite lava" problem)
   */
  private applyReaction(srcX: number, srcY: number, targetX: number, targetY: number, reaction: Reaction): void {
    // A. Transform the TARGET (victim)
    if (reaction.targetBecomes === null) {
      this.removeParticle(targetX, targetY)
    } else {
      this.replaceParticle(targetX, targetY, reaction.targetBecomes)
    }
    
    // B. Transform the SOURCE (aggressor) - BILATERAL!
    // undefined = no change, null = destroyed, ElementType = transform
    if (reaction.sourceBecomes !== undefined) {
      if (reaction.sourceBecomes === null) {
        // Source is destroyed (e.g., fire extinguished by water)
        this.removeParticle(srcX, srcY)
      } else {
        // Source transforms (e.g., lava -> stone, fire -> smoke)
        this.replaceParticle(srcX, srcY, reaction.sourceBecomes)
      }
    }
    
    // C. Spawn byproduct (smoke, steam)
    if (reaction.spawn) {
      // Try to spawn above the reaction site
      if (this.grid.isEmpty(srcX, srcY - 1)) {
        this.addParticle(srcX, srcY - 1, reaction.spawn)
      } else if (this.grid.isEmpty(targetX, targetY - 1)) {
        this.addParticle(targetX, targetY - 1, reaction.spawn)
      }
    }
  }
  
  /**
   * Replace a particle with a new element type (keeps position)
   */
  private replaceParticle(x: number, y: number, element: ElementType): void {
    const seed = (x * 7 + y * 13 + this.frame) & 31
    const particle: Particle = {
      element,
      color: getColorWithVariation(element, seed),
      updated: true, // Mark as updated so it doesn't process again this frame
      lifetime: ELEMENTS[element].lifetime,
    }
    this.grid.set(x, y, particle)
  }
}
