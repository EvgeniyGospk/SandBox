export const MENU_BG_VERTEX_SHADER = `#version 300 es
  in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

export const MENU_BG_FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;
  out vec4 fragColor;

  // Noise function
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 p = uv * 3.0;
    
    float t = u_time * 0.15;
    
    // Flowing particles effect
    float n1 = fbm(p + vec2(t, t * 0.5));
    float n2 = fbm(p * 2.0 - vec2(t * 0.7, t));
    float n3 = fbm(p * 0.5 + vec2(sin(t), cos(t * 0.5)));
    
    // Color mixing - dark blue to purple gradient
    vec3 col1 = vec3(0.02, 0.02, 0.08); // Deep dark
    vec3 col2 = vec3(0.1, 0.05, 0.2);   // Dark purple
    vec3 col3 = vec3(0.2, 0.1, 0.4);    // Purple
    vec3 col4 = vec3(0.1, 0.3, 0.6);    // Blue accent
    
    vec3 color = col1;
    color = mix(color, col2, n1 * 0.6);
    color = mix(color, col3, n2 * 0.3);
    color += col4 * n3 * 0.15;
    
    // Vignette
    float vignette = 1.0 - length(uv - 0.5) * 0.8;
    color *= vignette;
    
    // Subtle scan lines
    color *= 0.95 + 0.05 * sin(gl_FragCoord.y * 2.0);
    
    fragColor = vec4(color, 1.0);
  }
`
