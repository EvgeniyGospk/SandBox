export type RebuildStage = 'idle' | 'compiling' | 'reloading' | 'done' | 'error'

export type RebuildSummary = {
  packs: number
  enabledPacks: number
  elements: number
  reactions: number
}

export type RebuildUiState = {
  stage: RebuildStage
  message?: string
  summary?: RebuildSummary
}
