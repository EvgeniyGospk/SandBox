export function renderThermal(args: {
  pixels: Uint8ClampedArray
  temps: Float32Array
  width: number
  height: number
  getThermalColor: (t: number) => [number, number, number]
}): void {
  const { pixels, temps, width, height, getThermalColor } = args

  const len = Math.min(temps.length, width * height)

  for (let i = 0; i < len; i++) {
    const temp = temps[i]
    const base = i << 2

    const [r, g, b] = getThermalColor(temp)

    pixels[base] = r
    pixels[base + 1] = g
    pixels[base + 2] = b
    pixels[base + 3] = 255
  }
}
