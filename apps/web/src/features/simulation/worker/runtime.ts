import type { WorkerMessage } from './types'

import { createWorkerContext } from './context'
import { postWorkerError } from './errors'
import { parseWorkerMessage } from './validation'

import { handleInit } from './handlers/init'
import { handlePause, handlePlay } from './handlers/playback'
import { handleStep } from './handlers/step'
import { handleInputEnd, handleInputMessage } from './handlers/input'
import { handleTransform } from './handlers/transform'
import { handleSettings } from './handlers/settings'
import { handleRenderMode } from './handlers/renderMode'
import { handleClear } from './handlers/clear'
import { handleFill } from './handlers/fill'
import { handleSpawnRigidBody } from './handlers/rigidBody'
import { handlePipette } from './handlers/pipette'
import { handleSnapshot } from './handlers/snapshot'
import { handleLoadSnapshot } from './handlers/loadSnapshot'
import { handleResize } from './handlers/resize'
import { handleSetViewport } from './handlers/viewport'
import { handleLoadContentBundle } from './handlers/loadContentBundle'

const ctx = createWorkerContext()

self.onmessage = (e: MessageEvent<unknown>) => {
  const parsed = parseWorkerMessage(e.data)
  if (!parsed.ok) {
    postWorkerError({ message: parsed.error, extra: { receivedType: parsed.receivedType } })
    return
  }

  const msg: WorkerMessage = parsed.msg

  try {
    switch (msg.type) {
      case 'INIT':
        handleInit(ctx, msg)
        break

      case 'PLAY':
        handlePlay(ctx)
        break

      case 'PAUSE':
        handlePause(ctx)
        break

      case 'STEP':
        handleStep(ctx)
        break

      case 'FILL': {
        handleFill(ctx, msg)
        break
      }

      case 'SPAWN_RIGID_BODY': {
        handleSpawnRigidBody(ctx, msg)
        break
      }

      case 'PIPETTE': {
        handlePipette(ctx, msg)
        break
      }

      case 'SNAPSHOT': {
        handleSnapshot(ctx, msg)
        break
      }

      case 'LOAD_SNAPSHOT': {
        handleLoadSnapshot(ctx, msg)
        break
      }

      case 'INPUT':
        handleInputMessage(ctx, msg)
        break

      case 'INPUT_END':
        handleInputEnd(ctx)
        break

      case 'TRANSFORM':
        handleTransform(ctx, msg)
        break

      case 'SETTINGS':
        handleSettings(ctx, msg)
        break

      case 'SET_RENDER_MODE':
        handleRenderMode(ctx, msg)
        break

      case 'CLEAR':
        handleClear(ctx)
        break

      case 'LOAD_CONTENT_BUNDLE': {
        handleLoadContentBundle(ctx, msg)
        break
      }

      case 'RESIZE': {
        handleResize(ctx, msg)
        break
      }

      case 'SET_VIEWPORT': {
        handleSetViewport(ctx, msg)
        break
      }
    }
  } catch (err) {
    postWorkerError({
      message: 'Worker handler error',
      error: err,
      extra: { messageType: msg.type },
    })
  }
}

export {}
