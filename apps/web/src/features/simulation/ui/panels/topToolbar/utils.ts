import type { UploadedFileEntry } from '@/features/simulation/content/compilePacksToBundle'

export function validateContentBundleJson(json: string): { ok: true } | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return { ok: false, message: 'Invalid JSON root' }

    const rec = parsed as Record<string, unknown>
    if (typeof rec.formatVersion !== 'number') return { ok: false, message: 'Missing formatVersion' }
    if (!Array.isArray(rec.packs)) return { ok: false, message: 'Missing packs[]' }
    if (!Array.isArray(rec.elements)) return { ok: false, message: 'Missing elements[]' }
    if (!Array.isArray(rec.reactions)) return { ok: false, message: 'Missing reactions[]' }
    if (!rec.elementKeyToId || typeof rec.elementKeyToId !== 'object') return { ok: false, message: 'Missing elementKeyToId' }

    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

export async function readSelectedFiles(files: FileList | null): Promise<File[]> {
  if (!files) return []
  return Array.from(files)
}

export async function collectDroppedFileEntries(dataTransfer: DataTransfer): Promise<UploadedFileEntry[]> {
  const items = Array.from(dataTransfer.items ?? [])

  const out: UploadedFileEntry[] = []

  async function collectEntry(entry: any, base: string): Promise<void> {
    if (!entry) return

    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file((f: File) => resolve(f), (e: unknown) => reject(e))
      })
      const relPath = base.length > 0 ? `${base}/${entry.name}` : entry.name
      out.push({ file, relPath })
      return
    }

    if (entry.isDirectory) {
      const nextBase = base.length > 0 ? `${base}/${entry.name}` : entry.name
      const reader = entry.createReader()
      const all: any[] = []

      while (true) {
        const batch = await new Promise<any[]>((resolve, reject) => {
          reader.readEntries((entries: any[]) => resolve(entries), (e: unknown) => reject(e))
        })
        if (!batch || batch.length === 0) break
        all.push(...batch)
      }

      for (const child of all) {
        await collectEntry(child, nextBase)
      }
    }
  }

  const rootEntries: any[] = []
  for (const it of items) {
    const entry = (it as any).webkitGetAsEntry?.()
    if (entry) rootEntries.push(entry)
  }

  if (rootEntries.length > 0) {
    for (const entry of rootEntries) {
      await collectEntry(entry, '')
    }
    return out
  }

  const files = Array.from(dataTransfer.files ?? [])
  for (const f of files) {
    out.push({ file: f, relPath: f.name })
  }
  return out
}
