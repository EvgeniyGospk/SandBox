/**
 * WebGLRenderer - Production Grade
 * 
 * Phase 3: WebGL Revolution + Border Rendering
 * Phase 2: PBO double-buffering for async upload
 * 
 * Features:
 * - Zero-copy upload (WASM -> GPU via texSubImage2D)
 * - Hardware accelerated Zoom & Pan (Vertex Shader)
 * - Full texture uploads (simple, always-live rendering)
 * - PHASE 2: PBO double-buffering for async upload
 * - Neon Border rendering (Line Shader)
 */

import { debugLog, debugWarn } from '@/platform/logging/log'
import { LINE_FRAGMENT_SHADER, LINE_VERTEX_SHADER, TEX_FRAGMENT_SHADER, TEX_VERTEX_SHADER } from './webgl/shaders'
import { createProgram } from './webgl/program'
import { createBorderBuffer, createQuadBuffer } from './webgl/geometry'
import { drawTexturePass as drawTexturePassImpl } from './webgl/passes/texturePass'
import { drawInnerSharpLine, drawOuterGlow, prepareBorderPass } from './webgl/passes/borderPass'
import { setupContextLossHandlers as setupContextLossHandlersImpl } from './webgl/context/contextLoss'
import { initPBO as initPBOImpl } from './webgl/context/pbo'
import { reinitializeResources as reinitializeResourcesImpl } from './webgl/context/reinitialize'
import {
  uploadFull as uploadFullImpl,
} from './webgl/renderer/upload'
import { renderThermal as renderThermalImpl } from './webgl/renderer/thermal'
import { computeViewportSize, resizeWorldResources, updateBorderAndPBO } from './webgl/renderer/resize'

// Phase 2: PBO for async texture upload (WebGL 2.0)
const USE_PBO = true;

type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private forceFullUpload: boolean = false;
  private hasDoneFullUpload: boolean = false;
  
  // Phase 5: Context loss handling
  private contextLost: boolean = false;
  private needsReinit: boolean = false;
  
  // === Texture Pass (World) ===
  private texProgram: WebGLProgram;
  private texture: WebGLTexture;
  private quadBuffer: WebGLBuffer;
  private uTexTransform: WebGLUniformLocation | null = null;
  private uTexWorldSize: WebGLUniformLocation | null = null;
  private uTexViewportSize: WebGLUniformLocation | null = null;
  
  // === Border Pass (Lines) ===
  private lineProgram: WebGLProgram;
  private lineBuffer: WebGLBuffer;
  private uLineTransform: WebGLUniformLocation | null = null;
  private uLineWorldSize: WebGLUniformLocation | null = null;
  private uLineViewportSize: WebGLUniformLocation | null = null;
  private uLineColor: WebGLUniformLocation | null = null;
  
  // === PHASE 2: PBO Double-Buffering ===
  private pbo: [WebGLBuffer | null, WebGLBuffer | null] = [null, null];
  private pboIndex: number = 0; // Current PBO being uploaded to
  private pboSize: number = 0;  // Size of PBO in bytes
  private usePBO: boolean = false;
  
  // Dimensions (MUST be integers!)
  private worldWidth: number;
  private worldHeight: number;
  private viewportWidth: number;
  private viewportHeight: number;

  constructor(canvas: OffscreenCanvas, worldWidth: number, worldHeight: number) {
    // CRITICAL: Force integer sizes to prevent "falling through" bug
    this.worldWidth = Math.floor(worldWidth);
    this.worldHeight = Math.floor(worldHeight);
    this.viewportWidth = canvas.width;
    this.viewportHeight = canvas.height;
    
    // Phase 5: Setup context loss handlers
    this.setupContextLossHandlers(canvas);

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      antialias: false
    });

    if (!gl) throw new Error('WebGL 2 not supported');
    this.gl = gl;

    // Enable blending for border glow
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    // === Setup Texture Shader ===
    this.texProgram = createProgram(this.gl, TEX_VERTEX_SHADER, TEX_FRAGMENT_SHADER);
    this.quadBuffer = this.createQuadBuffer();

    // Setup Texture
    const tex = this.gl.createTexture();
    if (!tex) throw new Error('Failed to create texture');
    this.texture = tex;
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA, 
      this.worldWidth, this.worldHeight, 0, 
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );

    this.uTexTransform = this.gl.getUniformLocation(this.texProgram, 'u_transform');
    this.uTexWorldSize = this.gl.getUniformLocation(this.texProgram, 'u_worldSize');
    this.uTexViewportSize = this.gl.getUniformLocation(this.texProgram, 'u_viewportSize');

    // === Setup Line Shader (Border) ===
    this.lineProgram = createProgram(this.gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
    this.lineBuffer = this.createBorderBuffer();
    
    this.uLineTransform = this.gl.getUniformLocation(this.lineProgram, 'u_transform');
    this.uLineWorldSize = this.gl.getUniformLocation(this.lineProgram, 'u_worldSize');
    this.uLineViewportSize = this.gl.getUniformLocation(this.lineProgram, 'u_viewportSize');
    this.uLineColor = this.gl.getUniformLocation(this.lineProgram, 'u_color');
    
    // === PHASE 2: Setup PBO Double-Buffering ===
    if (USE_PBO) {
      this.initPBO();
    }
    
    debugLog(`🎮 WebGLRenderer: ${this.worldWidth}x${this.worldHeight} world, WebGL2 + Border${this.usePBO ? ' + PBO' : ''}`);
  }
  
  /**
   * PHASE 2: Initialize PBO double-buffer for async texture upload
   */
  private initPBO(): void {
    const gl = this.gl;
    
    // PBO size = world pixels * 4 bytes (RGBA)
    this.pboSize = this.worldWidth * this.worldHeight * 4;

    const { pbo, usePBO } = initPBOImpl({ gl, pboSize: this.pboSize })
    this.pbo = pbo
    this.usePBO = usePBO
  }

  /**
   * Phase 5: Setup WebGL context loss handlers
   * 
   * Context loss can happen when:
   * - GPU driver crashes
   * - Tab is in background too long (browser reclaims GPU resources)
   * - Switching between integrated/discrete GPU
   */
  private setupContextLossHandlers(canvas: OffscreenCanvas): void {
    setupContextLossHandlersImpl(canvas, {
      onContextLost: () => {
        debugWarn('⚠️ WebGL context lost');
        this.contextLost = true;
      },
      onContextRestored: () => {
        debugLog('✅ WebGL context restored, reinitializing...');
        this.contextLost = false;
        this.needsReinit = true;
      },
    })
  }

  /**
   * Check if WebGL context is available
   */
  get isContextLost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  /**
   * Render a full frame.
   */
  render(
    engine: WasmWorld,
    memory: WebAssembly.Memory,
    transform: { zoom: number; panX: number; panY: number }
  ): void {
    // Phase 5: Skip rendering if context is lost
    if (this.isContextLost) {
      return;
    }

    if (this.needsReinit) {
      try {
        this.reinitializeResources();
      } catch (e) {
        debugWarn('WebGL reinit failed:', e);
        this.contextLost = true;
        return;
      }
    }

    // 1. Clear
    this.gl.viewport(0, 0, this.viewportWidth, this.viewportHeight);
    this.gl.clearColor(0.04, 0.04, 0.04, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    // 2. Upload texture data
    this.uploadTexture(engine, memory);

    // 3. Draw World
    this.drawTexturePass(transform);

    // 4. Draw Border (Neon Style)
    this.drawBorderPass(transform);
  }

  private uploadTexture(engine: WasmWorld, memory: WebAssembly.Memory): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    this.uploadFull(engine, memory, !this.hasDoneFullUpload || this.forceFullUpload)

    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      debugWarn(`WebGL texture upload failed (gl error=${err}); will retry next frame`)
      this.hasDoneFullUpload = false;
    } else {
      this.hasDoneFullUpload = true;
    }

    this.forceFullUpload = false;
  }
  
  /**
   * PHASE 2: Full texture upload (with optional PBO)
   * 
   * @param immediate - Skip PBO double-buffering for instant display (used when paused)
   */
  private uploadFull(engine: WasmWorld, memory: WebAssembly.Memory, immediate: boolean = false): void {
    const res = uploadFullImpl({
      gl: this.gl,
      engine,
      memory,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      pboSize: this.pboSize,
      usePBO: this.usePBO,
      pbo: this.pbo,
      pboIndex: this.pboIndex,
      immediate,
    })

    this.pboIndex = res.pboIndex
  }

  /**
   * Request a full texture upload on next render (e.g., after mode switch)
   */
  requestFullUpload(): void {
    this.forceFullUpload = true;
  }

  private drawTexturePass(transform: { zoom: number; panX: number; panY: number }): void {
    // Texture pass must be fully opaque. If blending is enabled and the texture contains
    // any uninitialized/transparent pixels (alpha=0), the clear color shows through and
    // creates visible "chunk lighting" seams as chunks get uploaded.
    //
    // We still use blending for the border/glow pass.
    this.gl.disable(this.gl.BLEND)
    drawTexturePassImpl({
      gl: this.gl,
      texProgram: this.texProgram,
      quadBuffer: this.quadBuffer,
      uTexTransform: this.uTexTransform,
      uTexWorldSize: this.uTexWorldSize,
      uTexViewportSize: this.uTexViewportSize,
      transform,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
    })
  }

  private drawBorderPass(transform: { zoom: number; panX: number; panY: number }): void {
    // Border pass relies on alpha blending for glow.
    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
    prepareBorderPass({
      gl: this.gl,
      lineProgram: this.lineProgram,
      lineBuffer: this.lineBuffer,
      uLineTransform: this.uLineTransform,
      uLineWorldSize: this.uLineWorldSize,
      uLineViewportSize: this.uLineViewportSize,
      transform,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
    })

    // Outer Glow (transparent blue)
    drawOuterGlow({ gl: this.gl, uLineColor: this.uLineColor })

    // Inner Sharp Line (bright blue)
    drawInnerSharpLine({ gl: this.gl, uLineColor: this.uLineColor })
  }

  /**
   * Update viewport size (canvas size).
   * World/texture dimensions remain unchanged.
   */
  setViewportSize(width: number, height: number): void {
    const next = computeViewportSize(width, height)
    this.viewportWidth = next.viewportWidth
    this.viewportHeight = next.viewportHeight
  }

  /**
   * Resize world/texture resources (simulation dimensions).
   * Viewport size is managed independently via `setViewportSize`.
   */
  resizeWorld(width: number, height: number): void {
    this.forceFullUpload = true;
    this.hasDoneFullUpload = false;

    const resized = resizeWorldResources({
      gl: this.gl,
      texture: this.texture,
      width,
      height,
      usePBO: this.usePBO,
      pbo: this.pbo,
      pboIndex: this.pboIndex,
      onAfterResize: (worldWidth, worldHeight) => {
        this.worldWidth = worldWidth
        this.worldHeight = worldHeight
      },
    })

    this.pboSize = resized.pboSize
    this.pboIndex = resized.pboIndex

    // Update border geometry + refresh PBOs to match texture size
    const border = updateBorderAndPBO({
      gl: this.gl,
      lineBuffer: this.lineBuffer,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      usePboConstant: USE_PBO,
      pbo: this.pbo,
      pboIndex: this.pboIndex,
    })

    this.pbo = border.pbo
    this.pboIndex = border.pboIndex
    this.pboSize = border.pboSize
    this.usePBO = border.usePBO

    debugLog(`🎮 WebGLRenderer world resized: ${this.worldWidth}x${this.worldHeight}`);
  }

  /**
   * Backward-compatible resize (world + viewport).
   */
  resize(width: number, height: number): void {
    this.resizeWorld(width, height);
    this.setViewportSize(width, height);
  }

  /**
   * Render thermal mode: upload ImageData to texture and draw
   */
  renderThermal(imageData: ImageData, transform: { zoom: number; panX: number; panY: number }): void {
    renderThermalImpl({
      isContextLost: this.isContextLost,
      needsReinit: this.needsReinit,
      reinitializeResources: () => this.reinitializeResources(),
      onReinitError: () => {
        this.contextLost = true
      },

      gl: this.gl,
      texture: this.texture,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,

      imageData,
      transform,

      drawTexturePass: (t) => this.drawTexturePass(t),
      drawBorderPass: (t) => this.drawBorderPass(t),
    })
  }

  // === Buffer Helpers ===

  private createQuadBuffer(): WebGLBuffer {
    return createQuadBuffer(this.gl);
  }

  private createBorderBuffer(): WebGLBuffer {
    return createBorderBuffer(this.gl, this.worldWidth, this.worldHeight);
  }

  destroy(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.texProgram);
    this.gl.deleteProgram(this.lineProgram);
    this.gl.deleteBuffer(this.quadBuffer);
    this.gl.deleteBuffer(this.lineBuffer);
    
    // PHASE 2: Cleanup PBOs
    if (this.pbo[0]) this.gl.deleteBuffer(this.pbo[0]);
    if (this.pbo[1]) this.gl.deleteBuffer(this.pbo[1]);
  }

  private reinitializeResources(): void {
    const gl = this.gl;

    // Existing handles may be invalid after context loss; deletes are best-effort.
    try {
      gl.deleteTexture(this.texture);
      gl.deleteProgram(this.texProgram);
      gl.deleteProgram(this.lineProgram);
      gl.deleteBuffer(this.quadBuffer);
      gl.deleteBuffer(this.lineBuffer);
      if (this.pbo[0]) gl.deleteBuffer(this.pbo[0]);
      if (this.pbo[1]) gl.deleteBuffer(this.pbo[1]);
    } catch {
      // Ignore.
    }

    // Core GL state is reset after restore.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reinit = reinitializeResourcesImpl({
      gl,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      texVertexShader: TEX_VERTEX_SHADER,
      texFragmentShader: TEX_FRAGMENT_SHADER,
      lineVertexShader: LINE_VERTEX_SHADER,
      lineFragmentShader: LINE_FRAGMENT_SHADER,
    })

    this.texture = reinit.texture
    this.texProgram = reinit.texProgram
    this.quadBuffer = reinit.quadBuffer
    this.uTexTransform = reinit.uTexTransform
    this.uTexWorldSize = reinit.uTexWorldSize
    this.uTexViewportSize = reinit.uTexViewportSize

    this.lineProgram = reinit.lineProgram
    this.lineBuffer = reinit.lineBuffer
    this.uLineTransform = reinit.uLineTransform
    this.uLineWorldSize = reinit.uLineWorldSize
    this.uLineViewportSize = reinit.uLineViewportSize
    this.uLineColor = reinit.uLineColor

    // Reset PBOs
    this.pbo = [null, null];
    this.pboIndex = 0;
    this.usePBO = false;
    if (USE_PBO) this.initPBO();

    this.forceFullUpload = true;
    this.hasDoneFullUpload = false;
    this.needsReinit = false;
  }
}

// === SHADERS ===
