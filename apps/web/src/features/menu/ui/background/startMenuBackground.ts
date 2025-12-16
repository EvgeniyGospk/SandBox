import { startMenuBackgroundLoop } from './loop'
import { installFullscreenResize } from './resize'
import { MENU_BG_FRAGMENT_SHADER, MENU_BG_VERTEX_SHADER } from './shaders'
import { setupMenuBackgroundProgram } from './setup'

export function startMenuBackground(args: { canvas: HTMLCanvasElement }): (() => void) | void {
  const { canvas } = args

  const gl = canvas.getContext('webgl2')
  if (!gl) return

  const disposeResize = installFullscreenResize({ canvas, gl })

  const programData = setupMenuBackgroundProgram({
    gl,
    vertexShader: MENU_BG_VERTEX_SHADER,
    fragmentShader: MENU_BG_FRAGMENT_SHADER,
  })

  if (!programData) {
    disposeResize()
    return
  }

  const disposeLoop = startMenuBackgroundLoop({
    gl,
    canvas,
    program: programData.program,
    timeLoc: programData.timeLoc,
    resLoc: programData.resLoc,
  })

  return () => {
    disposeLoop()
    disposeResize()
  }
}
