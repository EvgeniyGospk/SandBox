export const TEX_VERTEX_SHADER = `#version 300 es
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

export const TEX_FRAGMENT_SHADER = `#version 300 es
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
    
    // Always write opaque alpha for the world texture pass.
    // We render into an \`alpha: false\` framebuffer, and leaving alpha from the texture
    // can create visible seams if blending is ever enabled (e.g. due to future refactors)
    // or if any texels are uninitialized (alpha=0).
    outColor = vec4(finalColor, 1.0);
}`;

export const LINE_VERTEX_SHADER = `#version 300 es
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

export const LINE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform vec4 u_color;
out vec4 outColor;

void main() {
  outColor = u_color;
}`;
