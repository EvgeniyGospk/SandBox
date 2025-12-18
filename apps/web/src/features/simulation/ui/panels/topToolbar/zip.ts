import { unzipSync } from 'fflate'

import type { UploadedFileEntry } from '@/features/simulation/content/compilePacksToBundle'

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '')
}

export function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith('.zip')) return true
  if (file.type === 'application/zip') return true
  if (file.type === 'application/x-zip-compressed') return true
  return false
}

export async function extractZipToFileEntries(zipFile: File): Promise<UploadedFileEntry[]> {
  const buf = new Uint8Array(await zipFile.arrayBuffer())
  const files = unzipSync(buf) as Record<string, Uint8Array>

  const out: UploadedFileEntry[] = []

  for (const [rawPath, data] of Object.entries(files)) {
    const relPath = normalizeZipPath(rawPath)
    if (!relPath) continue
    if (relPath.endsWith('/')) continue
    if (relPath.startsWith('__MACOSX/')) continue
    if (relPath.endsWith('.DS_Store')) continue

    const name = relPath.split('/').pop() ?? 'file'
    const type = relPath.toLowerCase().endsWith('.json') ? 'application/json' : 'application/octet-stream'
    const ab = new ArrayBuffer(data.byteLength)
    new Uint8Array(ab).set(data)
    const file = new File([ab], name, { type })

    out.push({ file, relPath })
  }

  return out
}
