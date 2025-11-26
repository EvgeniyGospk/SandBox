/**
 * Main engine export
 * Combines Simulation + Renderer into easy-to-use class
 * 
 * Phase 2: Added WorkerParticleEngine for multi-threaded simulation
 */

import { Simulation } from './core/Simulation'
import { CanvasRenderer, RenderMode } from './Renderer'
import { ElementType, WorldSettings } from './types'

export { ELEMENTS, getElementColor } from './elements'
export type { ElementType, WorldSettings } from './types'
export type { RenderMode } from './Renderer'

// Phase 2: Multi-threaded engine
export { WorkerParticleEngine } from './WorkerParticleEngine'
export { isSharedArrayBufferAvailable } from './core/SharedGrid'

// Phase 3: WASM engine
export { WasmParticleEngine, loadWasmEngine, isWasmAvailable } from './WasmParticleEngine'

export class ParticleEngine {
  private simulation: Simulation
  private renderer: CanvasRenderer | null = null
  private ctx: CanvasRenderingContext2D | null = null

  constructor(width: number, height: number) {
    this.simulation = new Simulation(width, height)
  }

  // Attach renderer to canvas context
  attachRenderer(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx
    this.renderer = new CanvasRenderer(ctx, this.simulation.width, this.simulation.height)
  }

  // Simulation passthrough
  get width(): number { return this.simulation.width }
  get height(): number { return this.simulation.height }
  get particleCount(): number { return this.simulation.particleCount }

  setSettings(settings: Partial<WorldSettings>): void {
    this.simulation.setSettings(settings)
  }

  addParticle(x: number, y: number, element: ElementType): boolean {
    return this.simulation.addParticle(x, y, element)
  }

  addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType): void {
    this.simulation.addParticlesInRadius(cx, cy, radius, element)
  }

  removeParticle(x: number, y: number): boolean {
    return this.simulation.removeParticle(x, y)
  }

  removeParticlesInRadius(cx: number, cy: number, radius: number): void {
    this.simulation.removeParticlesInRadius(cx, cy, radius)
  }

  clear(): void {
    this.simulation.clear()
  }

  step(): void {
    this.simulation.step()
  }

  resize(width: number, height: number): void {
    this.simulation.resize(width, height)
    if (this.renderer && this.ctx) {
      this.renderer.resize(width, height)
    }
  }

  render(): void {
    if (!this.renderer) return
    // NEW: Pass TypedArrays directly to renderer - no object allocation!
    this.renderer.render(
      this.simulation.getTypesArray(),
      this.simulation.getColorsArray(),
      this.simulation.getTemperatureArray()
    )
  }

  // Render mode control
  setRenderMode(mode: RenderMode): void {
    if (this.renderer) {
      this.renderer.setMode(mode)
    }
  }

  getRenderMode(): RenderMode {
    return this.renderer?.getMode() ?? 'normal'
  }

  // Camera control for zoom/pan
  setTransform(zoom: number, panX: number, panY: number): void {
    this.renderer?.setTransform(zoom, panX, panY)
  }
}
