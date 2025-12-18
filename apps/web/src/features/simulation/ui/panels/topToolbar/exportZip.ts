import { zipSync } from 'fflate'

import type { PackInput } from '@/features/simulation/content/compilePacksToBundle'

function toU8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function rebaseRelPath(args: { fileRelPath: string; packRootPath: string; packId: string }): string {
  const { fileRelPath, packRootPath, packId } = args
  const normalized = fileRelPath.replace(/\\/g, '/')

  let within = normalized
  if (packRootPath.length > 0) {
    const prefix = packRootPath.replace(/\\/g, '/')
    if (within === prefix) within = ''
    if (within.startsWith(prefix + '/')) within = within.slice(prefix.length + 1)
  }

  if (within.length === 0) return `${packId}/pack.json`
  return `${packId}/${within}`
}

export function createPacksZip(args: { packs: PackInput[] }): Blob {
  const { packs } = args

  const files: Record<string, Uint8Array> = {}

  for (const p of packs) {
    const packId = p.manifest.id
    files[`${packId}/pack.json`] = toU8(JSON.stringify(p.manifest, null, 2))

    for (const ef of p.elementFiles) {
      const relPath = rebaseRelPath({ fileRelPath: ef.relPath, packRootPath: p.rootPath, packId })
      files[relPath] = toU8(JSON.stringify(ef.data, null, 2))
    }

    for (const rf of p.reactionFiles) {
      const relPath = rebaseRelPath({ fileRelPath: rf.relPath, packRootPath: p.rootPath, packId })
      files[relPath] = toU8(JSON.stringify(rf.data, null, 2))
    }
  }

  const zipped = zipSync(files, { level: 6 })

  const ab = new ArrayBuffer(zipped.byteLength)
  new Uint8Array(ab).set(zipped)
  return new Blob([ab], { type: 'application/zip' })
}

export function downloadBlob(args: { blob: Blob; filename: string }): void {
  const { blob, filename } = args

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()

  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function makeModsZipFilename(): string {
  const d = new Date()
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `particula-mods-${yyyy}-${mm}-${dd}-${hh}${mi}.zip`
}
