# Технологический стек Particula (фактический)

## Скоуп репозитория

В текущем состоянии репозитория реализованы:
- `apps/web` — frontend (Vite + React)
- `packages/engine` — Rust движок (WASM)

Backend (API/WS/DB), CI/monitoring и docker‑оркестрация в этом репозитории **не реализованы** и относятся к roadmap.

## Frontend (`apps/web`)

### Core
- React
- TypeScript
- Vite
- Zustand

### UI
- TailwindCSS
- Framer Motion
- Lucide Icons

### Workers / performance
- `WorkerBridge` + `simulation.worker.ts` (OffscreenCanvas)
- `SharedArrayBuffer` input path (требует COOP/COEP в проде)

### Тесты / качество
- ESLint v9 (flat config в `apps/web/eslint.config.mjs`)
- Vitest (если/когда появятся unit‑тесты для web)

## Engine (`packages/engine`)

### Core
- Rust → `wasm32-unknown-unknown`
- `wasm-bindgen` (JS/WASM bindings)
- `wasm-bindgen-rayon` (threads, при включенном `parallel`)

### Артефакты WASM

Сборка генерирует JS/WASM файлы в `packages/engine-wasm/` (см. `npm run build:wasm`).

