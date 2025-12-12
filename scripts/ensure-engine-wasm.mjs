import { access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(scriptsDir)

const requiredFiles = [
  'packages/engine-wasm/particula_engine.js',
  'packages/engine-wasm/particula_engine.d.ts',
  'packages/engine-wasm/particula_engine_bg.wasm',
  'packages/engine-wasm/particula_engine_bg.wasm.d.ts'
]

const missing = []
for (const relPath of requiredFiles) {
  try {
    await access(join(repoRoot, relPath))
  } catch {
    missing.push(relPath)
  }
}

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    [
      'Missing WASM build artifacts:',
      ...missing.map((p) => `- ${p}`),
      '',
      'Generate them by running from repo root:',
      '  npm run build:wasm'
    ].join('\n')
  )
  process.exit(1)
}

