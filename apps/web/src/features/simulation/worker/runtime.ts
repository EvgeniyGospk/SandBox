import type { WorkerMessage } from './types'

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

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data

  switch (msg.type) {
    case 'INIT':
      handleInit(msg)
      break

    case 'PLAY':
      handlePlay()
      break

    case 'PAUSE':
      handlePause()
      break

    case 'STEP':
      handleStep()
      break

    case 'FILL': {
      handleFill(msg)
      break
    }

    case 'SPAWN_RIGID_BODY': {
      handleSpawnRigidBody(msg)
      break
    }

    case 'PIPETTE': {
      handlePipette(msg)
      break
    }

    case 'SNAPSHOT': {
      handleSnapshot(msg)
      break
    }

    case 'LOAD_SNAPSHOT': {
      handleLoadSnapshot(msg)
      break
    }

    case 'INPUT':
      handleInputMessage(msg)
      break

    case 'INPUT_END':
      handleInputEnd()
      break

    case 'TRANSFORM':
      handleTransform(msg)
      break

    case 'SETTINGS':
      handleSettings(msg)
      break

    case 'SET_RENDER_MODE':
      handleRenderMode(msg)
      break

    case 'CLEAR':
      handleClear()
      break

    case 'RESIZE': {
      handleResize(msg)
      break
    }

    case 'SET_VIEWPORT': {
      handleSetViewport(msg)
      break
    }
  }
}

export {}
