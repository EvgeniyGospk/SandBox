/**
 * WebGLRenderer - Production Grade
 * 
 * Phase 3: WebGL Revolution + Border Rendering
 * 
 * Features:
 * - Zero-copy upload (WASM -> GPU via texSubImage2D)
 * - Hardware accelerated Zoom & Pan (Vertex Shader)
 * - Dirty Rectangles support (only upload changed chunks)
 * - Neon Border rendering (Line Shader)
 */

const CHUNK_SIZE = 32;

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  
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
    
    console.log(`🎮 WebGLRenderer: ${this.worldWidth}x${this.worldHeight} world, WebGL2 + Border`);
  }

  /**
   * Render with Dirty Rectangles optimization
   */
  renderWithDirtyRects(
    engine: any,
    memory: WebAssembly.Memory,
    transform: { zoom: number; panX: number; panY: number }
  ): void {
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

  private uploadTexture(engine: any, memory: WebAssembly.Memory): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);

    const dirtyCount = engine.collect_dirty_chunks();
    
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
      const colorsPtr = engine.colors_ptr();
      this.gl.texSubImage2D(
        this.gl.TEXTURE_2D, 0, 0, 0,
        this.worldWidth, this.worldHeight,
        this.gl.RGBA, this.gl.UNSIGNED_BYTE,
        this.memoryView!, colorsPtr
      );
    } else {
      // Upload only dirty chunks
      const dirtyListPtr = engine.get_dirty_list_ptr();
      const dirtyList = new Uint32Array(memory.buffer, dirtyListPtr, dirtyCount);
      
      // Calculate max valid chunk positions to avoid overflow
      const maxChunkX = Math.floor(this.worldWidth / CHUNK_SIZE);
      const maxChunkY = Math.floor(this.worldHeight / CHUNK_SIZE);

      for (let i = 0; i < dirtyCount; i++) {
        const chunkIdx = dirtyList[i];
        
        const cx = chunkIdx % chunksX;
        const cy = (chunkIdx / chunksX) | 0;
        
        // Skip edge chunks that would overflow texture bounds
        // These will be updated on next full upload
        if (cx >= maxChunkX || cy >= maxChunkY) continue;
        
        const pixelsPtr = engine.extract_chunk_pixels(chunkIdx);
        
        this.gl.texSubImage2D(
          this.gl.TEXTURE_2D, 0,
          cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE,
          this.gl.RGBA, this.gl.UNSIGNED_BYTE,
          this.memoryView!, pixelsPtr
        );
      }
    }
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
   * Resize both viewport and world
   */
  resize(width: number, height: number): void {
    this.worldWidth = Math.floor(width);
    this.worldHeight = Math.floor(height);
    this.viewportWidth = this.worldWidth;
    this.viewportHeight = this.worldHeight;
    
    // Resize texture
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 0, this.gl.RGBA,
      this.worldWidth, this.worldHeight, 0,
      this.gl.RGBA, this.gl.UNSIGNED_BYTE, null
    );
    
    // Update border geometry
    this.updateBorderBuffer();
    
    console.log(`🎮 WebGLRenderer resized: ${this.worldWidth}x${this.worldHeight}`);
  }

  /**
   * Render thermal mode: upload ImageData to texture and draw
   */
  renderThermal(imageData: ImageData, transform: { zoom: number; panX: number; panY: number }): void {
    const gl = this.gl;
    
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
    const buffer = this.gl.createBuffer()!;
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
    const buffer = this.gl.createBuffer()!;
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
  }

  private createProgram(vs: string, fs: string): WebGLProgram {
    const p = this.gl.createProgram()!;
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
    const s = this.gl.createShader(type)!;
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
