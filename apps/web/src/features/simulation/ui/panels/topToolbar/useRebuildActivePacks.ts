import { useCallback, useEffect, useRef, useState } from 'react'

import { compilePacksToBundleFromParsedPacks } from '@/features/simulation/content/compilePacksToBundle'

import type { ContentBundleStatus } from '@/features/simulation/model/simulationStore'
import type { PackInput } from '@/features/simulation/content/compilePacksToBundle'

import type { RebuildSummary, RebuildUiState } from './types'
import { validateContentBundleJson } from './utils'

export function useRebuildActivePacks(args: {
  getActivePacks: () => PackInput[]
  contentBundleStatus: ContentBundleStatus | null
  setContentBundleStatus: (status: ContentBundleStatus | null) => void
  loadContentBundleJson: (json: string) => void
}): {
  rebuildUi: RebuildUiState
  isRebuildBusy: boolean
  rebuildActivePacks: () => void
} {
  const { getActivePacks, contentBundleStatus, setContentBundleStatus, loadContentBundleJson } = args

  const [rebuildUi, setRebuildUi] = useState<RebuildUiState>({ stage: 'idle' })
  const rebuildHideTimerRef = useRef<number | null>(null)

  const isRebuildBusy = rebuildUi.stage === 'compiling' || rebuildUi.stage === 'reloading'

  const rebuildActivePacks = useCallback(() => {
    if (rebuildHideTimerRef.current !== null) {
      window.clearTimeout(rebuildHideTimerRef.current)
      rebuildHideTimerRef.current = null
    }

    setRebuildUi({ stage: 'compiling' })
    setContentBundleStatus({ phase: 'reload', status: 'loading' })

    try {
      const active = getActivePacks()
      const bundle = compilePacksToBundleFromParsedPacks({ packs: active })
      const json = JSON.stringify(bundle)
      const validation = validateContentBundleJson(json)
      if (!validation.ok) {
        setRebuildUi({ stage: 'error', message: validation.message })
        setContentBundleStatus({ phase: 'reload', status: 'error', message: validation.message })
        return
      }

      const summary: RebuildSummary = {
        packs: bundle.packs.length,
        enabledPacks: active.length,
        elements: bundle.elements.length,
        reactions: bundle.reactions.length,
      }

      setRebuildUi({ stage: 'reloading', summary })
      loadContentBundleJson(json)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to compile packs'
      setRebuildUi({ stage: 'error', message })
      setContentBundleStatus({ phase: 'reload', status: 'error', message })
    }
  }, [getActivePacks, loadContentBundleJson, setContentBundleStatus])

  useEffect(() => {
    return () => {
      if (rebuildHideTimerRef.current !== null) {
        window.clearTimeout(rebuildHideTimerRef.current)
        rebuildHideTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!contentBundleStatus) return
    if (contentBundleStatus.phase !== 'reload') return

    if (contentBundleStatus.status === 'loading') {
      setRebuildUi((prev) => {
        if (prev.stage === 'idle') return prev
        if (prev.stage === 'compiling') return prev
        if (prev.stage === 'reloading') return prev
        return { ...prev, stage: 'reloading' }
      })
      return
    }

    if (contentBundleStatus.status === 'loaded') {
      setRebuildUi((prev) => ({
        ...prev,
        stage: 'done',
        message: 'Reloaded successfully',
      }))

      if (rebuildHideTimerRef.current !== null) window.clearTimeout(rebuildHideTimerRef.current)
      rebuildHideTimerRef.current = window.setTimeout(() => {
        setRebuildUi({ stage: 'idle' })
        rebuildHideTimerRef.current = null
      }, 2500)
      return
    }

    if (contentBundleStatus.status === 'error') {
      setRebuildUi((prev) => ({
        ...prev,
        stage: 'error',
        message: contentBundleStatus.message ?? 'Failed to reload',
      }))
    }
  }, [contentBundleStatus])

  return { rebuildUi, isRebuildBusy, rebuildActivePacks }
}
