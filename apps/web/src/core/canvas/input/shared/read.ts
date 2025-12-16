export function readAllEvents(args: {
  buffer: Int32Array
  inputBufferSize: number
  eventSize: number
  headOffset: number
}): Array<{ x: number; y: number; type: number; val: number }> {
  const { buffer, inputBufferSize, eventSize, headOffset } = args

  const writeIndex = Atomics.load(buffer, 0)
  let readIndex = Atomics.load(buffer, 1)

  const events: Array<{ x: number; y: number; type: number; val: number }> = []

  while (readIndex !== writeIndex) {
    const offset = headOffset + readIndex * eventSize

    events.push({
      x: buffer[offset + 0],
      y: buffer[offset + 1],
      type: buffer[offset + 2],
      val: buffer[offset + 3],
    })

    readIndex = (readIndex + 1) % inputBufferSize
  }

  Atomics.store(buffer, 1, readIndex)

  return events
}

export function processAllEvents(args: {
  buffer: Int32Array
  inputBufferSize: number
  eventSize: number
  headOffset: number
  callback: (x: number, y: number, type: number, val: number) => void
}): number {
  const { buffer, inputBufferSize, eventSize, headOffset, callback } = args

  const writeIndex = Atomics.load(buffer, 0)
  let readIndex = Atomics.load(buffer, 1)
  let count = 0

  while (readIndex !== writeIndex) {
    const offset = headOffset + readIndex * eventSize

    callback(buffer[offset + 0], buffer[offset + 1], buffer[offset + 2], buffer[offset + 3])

    readIndex = (readIndex + 1) % inputBufferSize
    count++
  }

  Atomics.store(buffer, 1, readIndex)
  return count
}

export function pendingEventCount(args: { buffer: Int32Array; inputBufferSize: number }): number {
  const { buffer, inputBufferSize } = args

  const writeIndex = Atomics.load(buffer, 0)
  const readIndex = Atomics.load(buffer, 1)

  if (writeIndex >= readIndex) {
    return writeIndex - readIndex
  }
  return inputBufferSize - readIndex + writeIndex
}
