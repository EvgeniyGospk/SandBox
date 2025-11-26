/**
 * High-performance renderer using Double Buffering
 * Phase 5: ABGR direct copy + OffscreenCanvas optimization
 * 
 * Optimizations:
 * - ABGR format: Direct pixels32.set() from WASM memory
 * - OffscreenCanvas: Better memory management, no DOM overhead
 * - Uint32Array.fill(): 50-100x faster clear
 * - No object access = no pointer chasing = cache friendly
 */

import { EL_EMPTY } from './types'

export type RenderMode = 'normal' | 'thermal'

// Check OffscreenCanvas support
const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D  // Screen (visible)
  
  // Virtual buffer (Offscreen) - use OffscreenCanvas if available
  private bufferCanvas: HTMLCanvasElement | OffscreenCanvas
  private bufferCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private imageData: ImageData
  private pixels: Uint8ClampedArray
  private pixels32: Uint32Array  // View over pixels for fast fill
  
  private width: number
  private height: number
  private mode: RenderMode = 'normal'

  // Camera state
  private zoom: number = 1
  private panX: number = 0
  private panY: number = 0
  
  // Background color as packed ABGR (for Uint32Array)
  // 0xFF0A0A0A = alpha=255, r=10, g=10, b=10
  private readonly BG_COLOR_32 = 0xFF0A0A0A
  private readonly BG_R = 10
  private readonly BG_G = 10
  private readonly BG_B = 10

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx
    this.width = width
    this.height = height

    // 1. Create offscreen buffer - prefer OffscreenCanvas for better performance
    if (hasOffscreenCanvas) {
      this.bufferCanvas = new OffscreenCanvas(width, height)
      const bCtx = this.bufferCanvas.getContext('2d', { alpha: false })
      if (!bCtx) throw new Error('Failed to create OffscreenCanvas context')
      this.bufferCtx = bCtx
    } else {
      this.bufferCanvas = document.createElement('canvas')
      this.bufferCanvas.width = width
      this.bufferCanvas.height = height
      const bCtx = this.bufferCanvas.getContext('2d', { alpha: false })
      if (!bCtx) throw new Error('Failed to create buffer context')
      this.bufferCtx = bCtx
    }

    // 2. Pixels are tied to buffer
    this.imageData = this.bufferCtx.createImageData(width, height)
    this.pixels = this.imageData.data
    // Create Uint32 view over the same buffer for fast operations
    this.pixels32 = new Uint32Array(this.pixels.buffer)
    
    // Pixel-art rendering (no smoothing on zoom)
    this.ctx.imageSmoothingEnabled = false
    
    this.clearPixels()
  }

  // Camera control from outside
  setTransform(zoom: number, panX: number, panY: number): void {
    this.zoom = zoom
    this.panX = panX
    this.panY = panY
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    
    // Resize buffer (works for both HTMLCanvasElement and OffscreenCanvas)
    this.bufferCanvas.width = width
    this.bufferCanvas.height = height
    this.imageData = this.bufferCtx.createImageData(width, height)
    this.pixels = this.imageData.data
    this.pixels32 = new Uint32Array(this.pixels.buffer)
    
    // Re-disable smoothing after resize
    this.ctx.imageSmoothingEnabled = false
    
    this.clearPixels()
  }

  setMode(mode: RenderMode): void {
    this.mode = mode
  }

  getMode(): RenderMode {
    return this.mode
  }

  // OPTIMIZED: Use Uint32Array.fill() - 50-100x faster than loop!
  private clearPixels(): void {
    this.pixels32.fill(this.BG_COLOR_32)
  }

  // NEW API: Accept TypedArrays directly
  render(types: Uint8Array, colors: Uint32Array, temperatureData?: Float32Array): void {
    // 1. Render pixels to BUFFER
    if (this.mode === 'thermal' && temperatureData) {
      this.renderThermal(temperatureData)
    } else {
      this.renderNormalTyped(types, colors)
    }

    // Put pixels to buffer context
    this.bufferCtx.putImageData(this.imageData, 0, 0)

    // 2. Draw BUFFER to SCREEN with camera transform
    // Clear screen with background
    this.ctx.fillStyle = `rgb(${this.BG_R}, ${this.BG_G}, ${this.BG_B})`
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
    
    this.ctx.save()
    // Apply Pan then Zoom
    this.ctx.translate(this.panX, this.panY)
    this.ctx.scale(this.zoom, this.zoom)
    
    // Draw buffer image
    this.ctx.drawImage(this.bufferCanvas, 0, 0)
    
    // 3. Draw world border (neon glow effect)
    this.drawWorldBorder()
    
    this.ctx.restore()
  }

  /**
   * Draw a stylish border around the simulation world
   * Creates a neon glow effect with gradient
   */
  private drawWorldBorder(): void {
    const ctx = this.ctx
    const w = this.width
    const h = this.height
    
    // Outer glow (wider, more transparent)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)' // Blue glow
    ctx.lineWidth = 6 / this.zoom // Compensate for zoom
    ctx.strokeRect(-3 / this.zoom, -3 / this.zoom, w + 6 / this.zoom, h + 6 / this.zoom)
    
    // Middle glow
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
    ctx.lineWidth = 3 / this.zoom
    ctx.strokeRect(-1.5 / this.zoom, -1.5 / this.zoom, w + 3 / this.zoom, h + 3 / this.zoom)
    
    // Inner sharp border
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.lineWidth = 1 / this.zoom
    ctx.strokeRect(0, 0, w, h)
    
    // Corner accents (bright dots)
    const cornerSize = 8 / this.zoom
    ctx.fillStyle = '#3B82F6'
    
    // Top-left
    ctx.fillRect(-cornerSize / 2, -cornerSize / 2, cornerSize, 2 / this.zoom)
    ctx.fillRect(-cornerSize / 2, -cornerSize / 2, 2 / this.zoom, cornerSize)
    
    // Top-right
    ctx.fillRect(w - cornerSize / 2, -cornerSize / 2, cornerSize, 2 / this.zoom)
    ctx.fillRect(w - 2 / this.zoom + cornerSize / 2, -cornerSize / 2, 2 / this.zoom, cornerSize)
    
    // Bottom-left
    ctx.fillRect(-cornerSize / 2, h - 2 / this.zoom + cornerSize / 2, cornerSize, 2 / this.zoom)
    ctx.fillRect(-cornerSize / 2, h - cornerSize / 2, 2 / this.zoom, cornerSize)
    
    // Bottom-right
    ctx.fillRect(w - cornerSize / 2, h - 2 / this.zoom + cornerSize / 2, cornerSize, 2 / this.zoom)
    ctx.fillRect(w - 2 / this.zoom + cornerSize / 2, h - cornerSize / 2, 2 / this.zoom, cornerSize)
  }

  /**
   * Phase 5: ULTRA-OPTIMIZED direct copy from WASM memory!
   * WASM now returns ABGR format - direct copy with pixels32.set()
   * ~3-5x faster than byte-by-byte unpacking
   */
  private renderNormalTyped(types: Uint8Array, colors: Uint32Array): void {
    const pixels32 = this.pixels32
    const len = Math.min(types.length, this.width * this.height)
    
    // Fast path: Direct copy all colors (WASM provides ABGR format)
    // Background is already correct format, just set everything!
    pixels32.set(colors.subarray(0, len))
    
    // Fix empty cells to background color (particles have correct colors)
    // This is still fast because most cells are particles in active simulations
    for (let i = 0; i < len; i++) {
      if (types[i] === EL_EMPTY) {
        pixels32[i] = this.BG_COLOR_32
      }
    }
  }

  /**
   * Render thermal vision - temperature to color gradient
   */
  private renderThermal(temps: Float32Array): void {
    const pixels = this.pixels
    const len = Math.min(temps.length, this.width * this.height)

    for (let i = 0; i < len; i++) {
      const temp = temps[i]
      const base = i << 2
      
      const [r, g, b] = this.getThermalColor(temp)
      
      pixels[base] = r
      pixels[base + 1] = g
      pixels[base + 2] = b
      pixels[base + 3] = 255
    }
  }

  /**
   * Temperature to color gradient:
   * Blue (-20) -> Cyan (0) -> Green (20) -> Yellow (100) -> Red (500) -> White (1000)
   */
  private getThermalColor(t: number): [number, number, number] {
    // Freezing: Deep Blue to Blue
    if (t < 0) {
      const intensity = Math.min(1, Math.abs(t) / 30)
      return [0, 0, Math.floor(128 + 127 * intensity)]
    }
    
    // Cold: Blue to Cyan (0-20)
    if (t < 20) {
      const ratio = t / 20
      return [0, Math.floor(ratio * 255), 255]
    }
    
    // Ambient: Cyan to Green (20-50)
    if (t < 50) {
      const ratio = (t - 20) / 30
      return [0, 255, Math.floor(255 * (1 - ratio))]
    }
    
    // Warm: Green to Yellow (50-100)
    if (t < 100) {
      const ratio = (t - 50) / 50
      return [Math.floor(255 * ratio), 255, 0]
    }
    
    // Hot: Yellow to Red (100-500)
    if (t < 500) {
      const ratio = (t - 100) / 400
      return [255, Math.floor(255 * (1 - ratio)), 0]
    }
    
    // Extreme: Red to White (500-1000+)
    const ratio = Math.min(1, (t - 500) / 500)
    return [255, Math.floor(255 * ratio), Math.floor(255 * ratio)]
  }
}
