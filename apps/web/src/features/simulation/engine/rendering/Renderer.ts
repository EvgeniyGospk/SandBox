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
import { applyDirtyChunksToBuffer } from './canvas/applyDirtyChunksToBuffer'
import { createRenderBuffer, resizeRenderBuffer } from './canvas/buffer'
import { drawBufferToScreen } from './canvas/drawBufferToScreen'
import { renderNormalTyped as renderNormalTypedPixels } from './canvas/renderNormalTyped'
import { renderThermal as renderThermalPixels } from './canvas/renderThermal'
import { getDirtyChunkIdsView, shouldFallbackToFullRender } from './canvas/smartRender'

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
  
  // Phase 3: Smart Rendering (Dirty Rectangles)
  private static readonly CHUNK_SIZE = 32
  private chunkImageData: ImageData

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx
    this.width = width
    this.height = height

    // 1. Create offscreen buffer - prefer OffscreenCanvas for better performance
    const buffer = createRenderBuffer({ width, height, useOffscreenCanvas: hasOffscreenCanvas })
    this.bufferCanvas = buffer.bufferCanvas
    this.bufferCtx = buffer.bufferCtx

    // 2. Pixels are tied to buffer
    this.imageData = buffer.imageData
    this.pixels = buffer.pixels
    // Create Uint32 view over the same buffer for fast operations
    this.pixels32 = buffer.pixels32
    
    // Pixel-art rendering (no smoothing on zoom)
    this.ctx.imageSmoothingEnabled = false
    
    // Phase 3: Create chunk ImageData once (32x32)
    this.chunkImageData = new ImageData(CanvasRenderer.CHUNK_SIZE, CanvasRenderer.CHUNK_SIZE)
    
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
    const resized = resizeRenderBuffer({ bufferCanvas: this.bufferCanvas, bufferCtx: this.bufferCtx, width, height })
    this.imageData = resized.imageData
    this.pixels = resized.pixels
    this.pixels32 = resized.pixels32
    
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
    // Match WebGL transform: scale around viewport center, then apply screen-space pan
    // Draw buffer image
    drawBufferToScreen({
      ctx: this.ctx,
      bufferCanvas: this.bufferCanvas,
      viewportW: this.ctx.canvas.width,
      viewportH: this.ctx.canvas.height,
      worldW: this.width,
      worldH: this.height,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      backgroundRgb: { r: this.BG_R, g: this.BG_G, b: this.BG_B },
      drawWorldBorder: (x, y, width, height) => {
        // 3. Draw world border (neon glow effect)
        this.drawWorldBorder(x, y, width, height)
      },
    })
  }

  /**
   * Draw a stylish border around the simulation world
   * Creates a neon glow effect with gradient
   */
  private drawWorldBorder(x: number, y: number, width: number, height: number): void {
    const ctx = this.ctx
    const z = this.zoom || 1
    
    // Outer glow (wider, more transparent)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)' // Blue glow
    ctx.lineWidth = 6 / z // Compensate for zoom
    ctx.strokeRect(x - 3 / z, y - 3 / z, width + 6 / z, height + 6 / z)
    
    // Middle glow
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
    ctx.lineWidth = 3 / z
    ctx.strokeRect(x - 1.5 / z, y - 1.5 / z, width + 3 / z, height + 3 / z)
    
    // Inner sharp border
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.lineWidth = 1 / z
    ctx.strokeRect(x, y, width, height)
    
    // Corner accents (bright dots)
    const cornerSize = 8 / z
    ctx.fillStyle = '#3B82F6'
    
    // Top-left
    ctx.fillRect(x - cornerSize / 2, y - cornerSize / 2, cornerSize, 2 / z)
    ctx.fillRect(x - cornerSize / 2, y - cornerSize / 2, 2 / z, cornerSize)
    
    // Top-right
    ctx.fillRect(x + width - cornerSize / 2, y - cornerSize / 2, cornerSize, 2 / z)
    ctx.fillRect(x + width - 2 / z + cornerSize / 2, y - cornerSize / 2, 2 / z, cornerSize)
    
    // Bottom-left
    ctx.fillRect(x - cornerSize / 2, y + height - 2 / z + cornerSize / 2, cornerSize, 2 / z)
    ctx.fillRect(x - cornerSize / 2, y + height - cornerSize / 2, 2 / z, cornerSize)
    
    // Bottom-right
    ctx.fillRect(x + width - cornerSize / 2, y + height - 2 / z + cornerSize / 2, cornerSize, 2 / z)
    ctx.fillRect(x + width - 2 / z + cornerSize / 2, y + height - cornerSize / 2, 2 / z, cornerSize)
  }

  /**
   * Phase 5: ULTRA-OPTIMIZED direct copy from WASM memory!
   * WASM now returns ABGR format - direct copy with pixels32.set()
   * ~3-5x faster than byte-by-byte unpacking
   */
  private renderNormalTyped(types: Uint8Array, colors: Uint32Array): void {
    const pixels32 = this.pixels32
    
    // Fast path: Direct copy all colors (WASM provides ABGR format)
    // Background is already correct format, just set everything!
    // Fix empty cells to background color (particles have correct colors)
    // This is still fast because most cells are particles in active simulations
    renderNormalTypedPixels({
      pixels32,
      types,
      colors,
      width: this.width,
      height: this.height,
      bgColor32: this.BG_COLOR_32,
    })
  }

  /**
   * Render thermal vision - temperature to color gradient
   */
  private renderThermal(temps: Float32Array): void {
    const pixels = this.pixels

    renderThermalPixels({
      pixels,
      temps,
      width: this.width,
      height: this.height,
      getThermalColor: (t) => this.getThermalColor(t),
    })
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
  
  // === PHASE 3: SMART RENDERING (Dirty Rectangles) ===
  
  /**
   * Smart render - only update dirty chunks
   * Massive performance improvement when most of the screen is static
   */
  renderSmart(
    engine: { 
      getDirtyChunksCount: () => number
      getDirtyListPtr: () => number
      extractChunkPixels: (idx: number) => number
      getChunksX: () => number
      render: () => void
    },
    memory: WebAssembly.Memory
  ): void {
    // 1. Ask Rust: how many chunks changed?
    const count = engine.getDirtyChunksCount()
    
    // Heuristic: If >70% of chunks changed, full render is faster
    const shouldFallback = shouldFallbackToFullRender({
      dirtyCount: count,
      worldWidth: this.width,
      worldHeight: this.height,
      chunkSize: CanvasRenderer.CHUNK_SIZE,
      thresholdRatio: 0.7,
    })
    
    if (shouldFallback) {
      // Fallback to full render
      engine.render()
      return
    }
    
    if (count === 0) {
      // Nothing changed, just redraw buffer to screen (for zoom/pan)
      this.drawBufferToScreen()
      return
    }
    
    // 2. Get dirty chunk list (zero-copy view into WASM memory)
    const listPtr = engine.getDirtyListPtr()
    const dirtyIds = getDirtyChunkIdsView({ memory, listPtr, count })
    
    const chunksX = engine.getChunksX()
    const CHUNK_SIZE = CanvasRenderer.CHUNK_SIZE
    
    // 3. Process each dirty chunk
    // Ask Rust to copy chunk pixels to transfer buffer
    // Create view into chunk pixels (4096 bytes = 32*32*4)
    // Copy to ImageData
    // Calculate screen position
    // Stamp chunk to buffer
    applyDirtyChunksToBuffer({
      engine,
      memory,
      dirtyIds,
      chunksX,
      chunkSize: CHUNK_SIZE,
      chunkImageData: this.chunkImageData,
      bufferCtx: this.bufferCtx,
    })
    
    // 4. Draw buffer to screen with camera transform
    this.drawBufferToScreen()
  }
  
  /**
   * Draw buffer canvas to screen with camera transform
   */
  private drawBufferToScreen(): void {
    // Clear screen with background
    // Draw buffer image
    drawBufferToScreen({
      ctx: this.ctx,
      bufferCanvas: this.bufferCanvas,
      viewportW: this.ctx.canvas.width,
      viewportH: this.ctx.canvas.height,
      worldW: this.width,
      worldH: this.height,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      backgroundRgb: { r: this.BG_R, g: this.BG_G, b: this.BG_B },
      drawWorldBorder: (x, y, width, height) => {
        // Draw world border
        this.drawWorldBorder(x, y, width, height)
      },
    })
  }
}
