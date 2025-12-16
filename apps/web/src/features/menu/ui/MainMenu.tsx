import { useState, useRef, useEffect } from 'react'
import { useSimulationStore, WORLD_SIZE_PRESETS, type WorldSizePreset } from '@/features/simulation/model/simulationStore'
import { Play, Settings, Sparkles } from 'lucide-react'

interface MainMenuProps {
  onStartGame: () => void
}

const WORLD_SIZE_INFO: Record<WorldSizePreset, { label: string; desc: string; fps: string }> = {
  tiny: { label: 'Tiny', desc: '256×192', fps: '~120+ FPS' },
  small: { label: 'Small', desc: '512×384', fps: '~90 FPS' },
  medium: { label: 'Medium', desc: '768×576', fps: '~60 FPS' },
  large: { label: 'Large', desc: '1024×768', fps: '~45 FPS' },
  full: { label: 'Full', desc: 'Viewport', fps: '~30 FPS' },
}

export function MainMenu({ onStartGame }: MainMenuProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { worldSizePreset, setWorldSizePreset } = useSimulationStore()
  const [showSettings, setShowSettings] = useState(false)

  // Animated shader background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2')
    if (!gl) return

    // Resize canvas
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    // Shader source
    const vertexShader = `#version 300 es
      in vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `

    const fragmentShader = `#version 300 es
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

    // Compile shaders
    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader))
        return null
      }
      return shader
    }

    const vs = compileShader(vertexShader, gl.VERTEX_SHADER)
    const fs = compileShader(fragmentShader, gl.FRAGMENT_SHADER)
    if (!vs || !fs) return

    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return
    }

    // Setup geometry (fullscreen quad)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW)

    const posLoc = gl.getAttribLocation(program, 'a_position')
    const timeLoc = gl.getUniformLocation(program, 'u_time')
    const resLoc = gl.getUniformLocation(program, 'u_resolution')

    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    // Animation loop
    let animId: number
    const startTime = performance.now()

    const render = () => {
      const time = (performance.now() - startTime) / 1000

      gl.useProgram(program)
      gl.uniform1f(timeLoc, time)
      gl.uniform2f(resLoc, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      animId = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Shader Background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {/* Logo */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl shadow-2xl shadow-purple-500/30" />
            <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
          </div>
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            Particula
          </h1>
          <p className="text-xl text-gray-400">
            Falling Sand Simulation
          </p>
        </div>

        {/* Main Menu Card */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 w-96 shadow-2xl">
          {!showSettings ? (
            // Main buttons
            <div className="space-y-4">
              <button
                onClick={onStartGame}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 
                         bg-gradient-to-r from-blue-600 to-purple-600 
                         hover:from-blue-500 hover:to-purple-500
                         rounded-xl font-semibold text-lg transition-all
                         shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40
                         hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play size={24} />
                Start Simulation
              </button>

              <button
                onClick={() => setShowSettings(true)}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 
                         bg-white/5 hover:bg-white/10 border border-white/10
                         rounded-xl font-medium transition-all
                         hover:scale-[1.02] active:scale-[0.98]"
              >
                <Settings size={20} />
                World Settings
              </button>
            </div>
          ) : (
            // Settings panel
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">World Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Close settings"
                  aria-label="Close settings"
                >
                  ✕
                </button>
              </div>

              {/* World Size Selection */}
              <div className="space-y-3">
                <label className="text-sm text-gray-400 font-medium">World Size</label>
                <div className="grid grid-cols-1 gap-2">
                  {(Object.keys(WORLD_SIZE_PRESETS) as WorldSizePreset[]).map((preset) => {
                    const info = WORLD_SIZE_INFO[preset]
                    const isSelected = worldSizePreset === preset
                    return (
                      <button
                        key={preset}
                        onClick={() => setWorldSizePreset(preset)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg 
                                   border transition-all ${
                          isSelected
                            ? 'bg-purple-600/30 border-purple-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{info.label}</span>
                          <span className="text-sm text-gray-500">{info.desc}</span>
                        </div>
                        <span className={`text-sm ${isSelected ? 'text-purple-300' : 'text-gray-500'}`}>
                          {info.fps}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-500 
                         rounded-xl font-medium transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-sm text-gray-600">
          Press ESC to return to menu
        </p>
      </div>
    </div>
  )
}
