import { EL_EMPTY } from '../../api/types'

export function renderNormalTyped(args: {
  pixels32: Uint32Array
  types: Uint8Array
  colors: Uint32Array
  width: number
  height: number
  bgColor32: number
}): void {
  const { pixels32, types, colors, width, height, bgColor32 } = args

  const len = Math.min(types.length, width * height)

  pixels32.set(colors.subarray(0, len))

  for (let i = 0; i < len; i++) {
    if (types[i] === EL_EMPTY) {
      pixels32[i] = bgColor32
    }
  }
}
