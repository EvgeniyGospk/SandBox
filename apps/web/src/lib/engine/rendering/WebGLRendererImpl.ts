/**
 * WebGLRenderer - Production Grade
 * 
 * Phase 3: WebGL Revolution + Border Rendering
 * Phase 2: GPU Batching with Merged Rectangles + PBO
 * 
 * Features:
 * - Zero-copy upload (WASM -> GPU via texSubImage2D)
 * - Hardware accelerated Zoom & Pan (Vertex Shader)
 * - Dirty Rectangles support (only upload changed chunks)
 * - PHASE 2: Merged rectangle batching (fewer GPU calls)
 * - PHASE 2: PBO double-buffering for async upload
 * - Neon Border rendering (Line Shader)
 */

import { debugLog, debugWarn, logError } from '../../log'

const CHUNK_SIZE = 32;

// Phase 2: Use merged rectangles for batching
// Enabled: merged-rect extraction is bounds-safe in Rust (see `World::extract_rect_pixels`)
const USE_MERGED_RECTS = true;

// Phase 2: PBO for async texture upload (WebGL 2.0)
const USE_PBO = true;

type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private forceFullUpload: boolean = false;
  
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
  
  // Memory view (reused)
  private memoryView: Uint8Array | null = null;
  
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
    this.texProgram = this.createProgram(TEX_VERTEX_SHADER, TEX_FRAGMENT_SHADER);
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
    this.lineProgram = this.createProgram(LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
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
    
    try {
      // Create two PBOs for double-buffering
      this.pbo[0] = gl.createBuffer();
      this.pbo[1] = gl.createBuffer();
      
      if (!this.pbo[0] || !this.pbo[1]) {
        debugWarn('Failed to create PBOs, falling back to direct upload');
        return;
      }
      
      // Initialize both PBOs with empty data
      for (let i = 0; i < 2; i++) {
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, this.pbo[i]);
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, this.pboSize, gl.STREAM_DRAW);
      }
      
      // Unbind PBO
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      
      this.usePBO = true;
      debugLog(`📦 PBO initialized: 2x ${(this.pboSize / 1024 / 1024).toFixed(2)}MB`);
    } catch (e) {
      debugWarn('PBO init failed:', e);
      this.usePBO = false;
    }
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
    // Note: OffscreenCanvas uses different event names
    canvas.addEventListener('webglcontextlost', ((e: Event) => {
      e.preventDefault();
      debugWarn('⚠️ WebGL context lost');
      this.contextLost = true;
    }) as EventListener);
    
    canvas.addEventListener('webglcontextrestored', (() => {
      debugLog('✅ WebGL context restored, reinitializing...');
      this.contextLost = false;
      this.needsReinit = true;
    }) as EventListener);
  }

  /**
   * Check if WebGL context is available
   */
  get isContextLost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  /**
   * Render with Dirty Rectangles optimization
   */
  renderWithDirtyRects(
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
    
    if (!this.memoryView || this.memoryView.buffer !== memory.buffer) {
      this.memoryView = new Uint8Array(memory.buffer);
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

    // PHASE 2: Use merged rectangles for fewer GPU calls
    if (USE_MERGED_RECTS) {
      this.uploadWithMergedRects(engine, memory);
      return;
    }

    // Fallback: Original per-chunk upload
    const dirtyCount = engine.collect_dirty_chunks();

    if (this.forceFullUpload) {
      this.uploadFull(engine, true);  // immediate=true to skip PBO latency
      this.forceFullUpload = false;
      return;
    }

    if (dirtyCount === 0) return;

    const chunksX = engine.chunks_x();
    const chunksY = engine.chunks_y();
    const totalChunks = chunksX * chunksY;
    
    // Check if world size is not aligned to chunk size (has edge chunks)
    const hasEdgeChunksX = (this.worldWidth % CHUNK_SIZE) !== 0;
    const hasEdgeChunksY = (this.worldHeight % CHUNK_SIZE) !== 0;
    const hasEdgeChunks = hasEdgeChunksX || hasEdgeChunksY;

    // Heuristic: Full upload if > 40% dirty OR if we have edge chunks (to avoid black bars)
    if (dirtyCount > totalChunks * 0.4 || (hasEdgeChunks && dirtyCount > 0)) {
      this.uploadFull(engine);
    } else {
      // Upload only dirty chunks, clamping edge chunk sizes to avoid GL errors
      const dirtyListPtr = engine.get_dirty_list_ptr();
      const dirtyList = new Uint32Array(memory.buffer, dirtyListPtr, dirtyCount);

      for (let i = 0; i < dirtyCount; i++) {
        const chunkIdx = dirtyList[i];
        
        const cx = chunkIdx % chunksX;
        const cy = (chunkIdx / chunksX) | 0;

        const xOffset = cx * CHUNK_SIZE;
        const yOffset = cy * CHUNK_SIZE;
        const uploadW = Math.min(CHUNK_SIZE, this.worldWidth - xOffset);
        const uploadH = Math.min(CHUNK_SIZE, this.worldHeight - yOffset);
        if (uploadW <= 0 || uploadH <= 0) continue;
        
        const pixelsPtr = engine.extract_chunk_pixels(chunkIdx);
        
        gl.texSubImage2D(
          gl.TEXTURE_2D, 0,
          xOffset, yOffset, uploadW, uploadH,
          gl.RGBA, gl.UNSIGNED_BYTE,
          this.memoryView!, pixelsPtr
        );
      }
    }
  }

  /**
   * PHASE 2: Upload using merged rectangles
   * 
   * Instead of N calls for N dirty chunks, we merge adjacent chunks
   * and upload fewer, larger rectangles.
   */
  private uploadWithMergedRects(engine: WasmWorld, _memory: WebAssembly.Memory): void {
    const gl = this.gl;
    
    // DEBUG WORKAROUND: can be enabled via env flag for diagnostics
    const DEBUG_FORCE_FULL = import.meta.env.VITE_FORCE_FULL_UPLOAD === 'true'
    if (DEBUG_FORCE_FULL) {
      this.uploadFull(engine);
      return;
    }
    
    // CRITICAL: Check forceFullUpload BEFORE collecting dirty rects
    // This ensures paused input (clicks) get uploaded immediately
    if (this.forceFullUpload) {
      this.uploadFull(engine, true);  // immediate=true to skip PBO latency
      this.forceFullUpload = false;
      return;
    }
    
    const rectCount = engine.collect_merged_rects();
    
    if (rectCount === 0) return;
    
	    // Heuristic: if many rects, just do full upload
	    const chunksX = engine.chunks_x();
	    const chunksY = engine.chunks_y();
	    const totalChunks = chunksX * chunksY;
	    
	    if (rectCount > totalChunks * 0.3) {
	      this.uploadFull(engine);
	      return;
	    }

	    // Heuristic: if merged rects cover a large portion of the world, full upload is cheaper
	    const worldPixels = this.worldWidth * this.worldHeight;
	    let coveredPixels = 0;
	    for (let i = 0; i < rectCount; i++) {
	      const x = engine.get_merged_rect_x(i);
	      const y = engine.get_merged_rect_y(i);
	      const w = engine.get_merged_rect_w(i);
	      const h = engine.get_merged_rect_h(i);
	      if (w === 0 || h === 0) continue;
	      if (x < 0 || y < 0 || x >= this.worldWidth || y >= this.worldHeight) continue;
	      const actualW = Math.min(w, this.worldWidth - x);
	      const actualH = Math.min(h, this.worldHeight - y);
	      if (actualW <= 0 || actualH <= 0) continue;
	      coveredPixels += actualW * actualH;
	      if (coveredPixels > worldPixels * 0.5) {
	        this.uploadFull(engine);
	        return;
	      }
	    }
    
    // Upload each merged rectangle
    try {
      for (let i = 0; i < rectCount; i++) {
        const x = engine.get_merged_rect_x(i);
        const y = engine.get_merged_rect_y(i);
        const w = engine.get_merged_rect_w(i);
        const h = engine.get_merged_rect_h(i);
        
        // Skip invalid rects
        if (w === 0 || h === 0) continue;
        
        // Clamp to world bounds
        const actualW = Math.min(w, this.worldWidth - x);
        const actualH = Math.min(h, this.worldHeight - y);
        
        if (actualW <= 0 || actualH <= 0) continue;
        
        // Extract pixels for this rectangle
        const pixelsPtr = engine.extract_rect_pixels(i);
        
        // Upload to texture
        // Note: texSubImage2D expects row-major data with stride = width
        gl.texSubImage2D(
          gl.TEXTURE_2D, 0,
          x, y, actualW, actualH,
          gl.RGBA, gl.UNSIGNED_BYTE,
          this.memoryView!, pixelsPtr
        );
      }
    } catch (e) {
      logError('uploadWithMergedRects failed, falling back to full upload:', e);
      this.uploadFull(engine);
    }
  }
  
  /**
   * PHASE 2: Full texture upload (with optional PBO)
   * 
   * @param immediate - Skip PBO double-buffering for instant display (used when paused)
   */
  private uploadFull(engine: WasmWorld, immediate: boolean = false): void {
    const gl = this.gl;
    const colorsPtr = engine.colors_ptr();
    
    // When immediate=true, skip PBO to avoid 1-frame latency (critical for paused input)
    if (!immediate && this.usePBO && this.pbo[this.pboIndex]) {
      // PBO path: async upload (1-frame latency but better throughput)
      // 1. Bind next PBO for upload
      const uploadPBO = this.pbo[this.pboIndex];
      const texturePBO = this.pbo[1 - this.pboIndex];
      
      // 2. Upload data to PBO (CPU → PBO, async DMA)
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, uploadPBO);
      gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, 
        this.memoryView!.subarray(colorsPtr, colorsPtr + this.pboSize));
      
      // 3. Upload from other PBO to texture (PBO → GPU, async)
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, texturePBO);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        this.worldWidth, this.worldHeight,
        gl.RGBA, gl.UNSIGNED_BYTE,
        0 // Offset in PBO
      );
      
      // 4. Unbind and swap
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      this.pboIndex = 1 - this.pboIndex;
    } else {
      // Direct upload (no PBO) - immediate display, slightly slower but no latency
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        this.worldWidth, this.worldHeight,
        gl.RGBA, gl.UNSIGNED_BYTE,
        this.memoryView!, colorsPtr
      );
    }
  }

  /**
   * Request a full texture upload on next render (e.g., after mode switch)
   */
  requestFullUpload(): void {
    this.forceFullUpload = true;
  }

  private drawTexturePass(transform: { zoom: number; panX: number; panY: number }): void {
    this.gl.useProgram(this.texProgram);
    
    this.gl.uniform4f(this.uTexTransform, transform.zoom, transform.panX, transform.panY, 0);
    this.gl.uniform2f(this.uTexWorldSize, this.worldWidth, this.worldHeight);
    this.gl.uniform2f(this.uTexViewportSize, this.viewportWidth, this.viewportHeight);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    const posLoc = this.gl.getAttribLocation(this.texProgram, 'a_position');
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawBorderPass(transform: { zoom: number; panX: number; panY: number }): void {
    this.gl.useProgram(this.lineProgram);

    this.gl.uniform4f(this.uLineTransform, transform.zoom, transform.panX, transform.panY, 0);
    this.gl.uniform2f(this.uLineWorldSize, this.worldWidth, this.worldHeight);
    this.gl.uniform2f(this.uLineViewportSize, this.viewportWidth, this.viewportHeight);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    const posLoc = this.gl.getAttribLocation(this.lineProgram, 'a_position');
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);

    // Outer Glow (transparent blue)
    this.gl.lineWidth(3.0);
    this.gl.uniform4f(this.uLineColor, 0.2, 0.5, 1.0, 0.4);
    this.gl.drawArrays(this.gl.LINE_LOOP, 0, 4);

    // Inner Sharp Line (bright blue)
    this.gl.lineWidth(1.0);
    this.gl.uniform4f(this.uLineColor, 0.4, 0.7, 1.0, 0.9);
    this.gl.drawArrays(this.gl.LINE_LOOP, 0, 4);
  }

  /**
   * Update viewport size (canvas size).
   * World/texture dimensions remain unchanged.
   */
  setViewportSize(width: number, height: number): void {
    this.viewportWidth = Math.floor(width);
    this.viewportHeight = Math.floor(height);
  }

  /**
   * Resize world/texture resources (simulation dimensions).
   * Viewport size is managed independently via `setViewportSize`.
   */
  resizeWorld(width: number, height: number): void {
    this.worldWidth = Math.floor(width);
    this.worldHeight = Math.floor(height);
    this.forceFullUpload = true;

    // Resize texture
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      this.worldWidth, this.worldHeight, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );

    // Resize PBO buffers (if enabled)
    if (this.usePBO && this.pbo[0] && this.pbo[1]) {
      const gl = this.gl;
      this.pboSize = this.worldWidth * this.worldHeight * 4;
      for (let i = 0; i < 2; i++) {
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, this.pbo[i]);
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, this.pboSize, gl.STREAM_DRAW);
      }
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      this.pboIndex = 0;
    }

    // Update border geometry
    this.updateBorderBuffer();

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
    
    const gl = this.gl;
    gl.viewport(0, 0, this.viewportWidth, this.viewportHeight);
    
    // Clear with dark background
    gl.clearColor(0.04, 0.04, 0.04, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Upload thermal image data to texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0,
      gl.RGBA, gl.UNSIGNED_BYTE,
      imageData
    );
    
    // Draw texture with transform
    this.drawTexturePass(transform);
    
    // Draw border
    this.drawBorderPass(transform);
  }

  // === Buffer Helpers ===

  private createQuadBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error('Failed to create WebGL buffer');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
    return buffer;
  }

  private createBorderBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error('Failed to create WebGL buffer');
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    // Border coordinates in world pixels (0,0) -> (W,0) -> (W,H) -> (0,H)
    const vertices = new Float32Array([
      0, 0,
      this.worldWidth, 0,
      this.worldWidth, this.worldHeight,
      0, this.worldHeight
    ]);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    return buffer;
  }

  private updateBorderBuffer(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
    const vertices = new Float32Array([
      0, 0,
      this.worldWidth, 0,
      this.worldWidth, this.worldHeight,
      0, this.worldHeight
    ]);
    this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, vertices);

    // Recreate PBOs to match new texture size
    if (USE_PBO) {
      // Delete old PBOs
      if (this.pbo[0]) this.gl.deleteBuffer(this.pbo[0]);
      if (this.pbo[1]) this.gl.deleteBuffer(this.pbo[1]);
      this.pbo = [null, null];
      this.pboIndex = 0;
      
      this.initPBO();
    }
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const p = this.gl.createProgram();
    if (!p) throw new Error('Failed to create WebGL program');
    const v = this.compileShader(this.gl.VERTEX_SHADER, vs);
    const f = this.compileShader(this.gl.FRAGMENT_SHADER, fs);
    this.gl.attachShader(p, v);
    this.gl.attachShader(p, f);
    this.gl.linkProgram(p);
    if (!this.gl.getProgramParameter(p, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(p)!);
    }
    return p;
  }

  private compileShader(type: number, src: string): WebGLShader {
    const s = this.gl.createShader(type);
    if (!s) throw new Error('Failed to create WebGL shader');
    this.gl.shaderSource(s, src);
    this.gl.compileShader(s);
    if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(s)!);
    }
    return s;
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

    this.texProgram = this.createProgram(TEX_VERTEX_SHADER, TEX_FRAGMENT_SHADER);
    this.quadBuffer = this.createQuadBuffer();

    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create texture');
    this.texture = tex;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.worldWidth, this.worldHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this.uTexTransform = gl.getUniformLocation(this.texProgram, 'u_transform');
    this.uTexWorldSize = gl.getUniformLocation(this.texProgram, 'u_worldSize');
    this.uTexViewportSize = gl.getUniformLocation(this.texProgram, 'u_viewportSize');

    this.lineProgram = this.createProgram(LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
    this.lineBuffer = this.createBorderBuffer();

    this.uLineTransform = gl.getUniformLocation(this.lineProgram, 'u_transform');
    this.uLineWorldSize = gl.getUniformLocation(this.lineProgram, 'u_worldSize');
    this.uLineViewportSize = gl.getUniformLocation(this.lineProgram, 'u_viewportSize');
    this.uLineColor = gl.getUniformLocation(this.lineProgram, 'u_color');

    // Reset PBOs
    this.pbo = [null, null];
    this.pboIndex = 0;
    this.usePBO = false;
    if (USE_PBO) this.initPBO();

    this.forceFullUpload = true;
    this.needsReinit = false;
  }
}

// === SHADERS ===

// Texture shader - renders world pixels
const TEX_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

uniform vec4 u_transform;     // x=zoom, y=panX, z=panY
uniform vec2 u_worldSize;
uniform vec2 u_viewportSize;

void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  v_texCoord.y = 1.0 - v_texCoord.y;
  
  vec2 pos = a_position;
  
  // Aspect ratio correction
  float worldAspect = u_worldSize.x / u_worldSize.y;
  float viewportAspect = u_viewportSize.x / u_viewportSize.y;
  
  if (worldAspect > viewportAspect) {
    pos.y *= viewportAspect / worldAspect;
  } else {
    pos.x *= worldAspect / viewportAspect;
  }
  
  // Transform (clip): zoom around viewport center, then apply screen-space pan
  
  // 1. Zoom FIRST (scale from origin)
  pos *= u_transform.x;
  
  // 2. Pan SECOND (translate in clip space)
  vec2 panClip = (u_transform.yz / u_viewportSize) * 2.0;
  panClip.y = -panClip.y;
  pos += panClip;
  
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

// Phase 5: Fragment shader with Bloom/Glow post-processing
const TEX_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2 u_worldSize;

// Pseudo-Bloom: sample neighbors for glow effect
vec3 getBloom(vec2 uv) {
    vec3 sum = vec3(0.0);
    vec2 pixel = 1.0 / u_worldSize;
    
    // 8-direction sampling for glow
    sum += texture(u_image, uv + vec2(-pixel.x, 0.0)).rgb;
    sum += texture(u_image, uv + vec2(pixel.x, 0.0)).rgb;
    sum += texture(u_image, uv + vec2(0.0, -pixel.y)).rgb;
    sum += texture(u_image, uv + vec2(0.0, pixel.y)).rgb;
    sum += texture(u_image, uv + vec2(-pixel.x, -pixel.y)).rgb * 0.7;
    sum += texture(u_image, uv + vec2(pixel.x, -pixel.y)).rgb * 0.7;
    sum += texture(u_image, uv + vec2(-pixel.x, pixel.y)).rgb * 0.7;
    sum += texture(u_image, uv + vec2(pixel.x, pixel.y)).rgb * 0.7;
    
    return sum * 0.12; // Glow intensity
}

void main() {
    vec4 color = texture(u_image, v_texCoord);
    
    // 1. Brightness threshold - only hot pixels glow (Fire/Lava/Spark)
    // Fire is orange/red, Lava is red/yellow - high R channel
    float brightness = max(color.r, max(color.g * 0.8, color.b * 0.3));
    
    vec3 glow = vec3(0.0);
    if (brightness > 0.6) {
        glow = getBloom(v_texCoord) * (brightness - 0.5);
    }
    
    // 2. Additive blending
    vec3 finalColor = color.rgb + glow;
    
    // 3. Subtle vignette (darken edges)
    vec2 uv = v_texCoord * (1.0 - v_texCoord.yx);
    float vig = uv.x * uv.y * 20.0;
    vig = clamp(pow(vig, 0.15), 0.6, 1.0);
    finalColor *= vig;
    
    // 4. Tone mapping (Reinhard) - prevents oversaturation
    finalColor = finalColor / (finalColor + vec3(1.0));
    
    // 5. Slight contrast boost
    finalColor = pow(finalColor, vec3(0.95));
    
    outColor = vec4(finalColor, color.a);
}`;

// Line shader - renders border
const LINE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;  // In world pixels

uniform vec4 u_transform;
uniform vec2 u_worldSize;
uniform vec2 u_viewportSize;

void main() {
  // Convert world pixels to normalized (0..1)
  vec2 norm = a_position / u_worldSize;
  
  // Convert to clip space (-1..1)
  vec2 clip = norm * 2.0 - 1.0;
  clip.y = -clip.y;
  
  // Aspect ratio correction (same as texture)
  float worldAspect = u_worldSize.x / u_worldSize.y;
  float viewportAspect = u_viewportSize.x / u_viewportSize.y;
  
  if (worldAspect > viewportAspect) {
    clip.y *= viewportAspect / worldAspect;
  } else {
    clip.x *= worldAspect / viewportAspect;
  }
  
  // Transform (clip): zoom around viewport center, then apply screen-space pan
  // 1. Zoom FIRST
  clip *= u_transform.x;
  
  // 2. Pan SECOND
  vec2 panClip = (u_transform.yz / u_viewportSize) * 2.0;
  panClip.y = -panClip.y;
  clip += panClip;
  
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const LINE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform vec4 u_color;
out vec4 outColor;

void main() {
  outColor = u_color;
}`;
