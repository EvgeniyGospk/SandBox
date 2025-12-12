# Архитектура Particula (фактический)

## Высокоуровневая схема

```
UI (React)
  |
  |  postMessage (init/commands) + SharedArrayBuffer (input events)
  v
Worker (simulation.worker.ts)
  |
  v
Rust/WASM (packages/engine)  +  Renderer (WebGL2, fallback Canvas2D)
```

## Разделение ответственности

### `apps/web` (main thread)
- UI / state (Zustand)
- Камера (zoom/pan) и конвертация координат ввода
- Инициализация worker/runtime, обработка resize

### `apps/web` (worker thread)
- WASM init + tick loop
- Обработка input (SAB ring buffer, fallback postMessage)
- Рендер в OffscreenCanvas:
  - WebGL2 (основной путь)
  - Canvas2D (fallback + thermal buffer)

### `packages/engine` (Rust)
- Хранение мира и симуляция частиц
- Экспорт API в WASM

## World vs Viewport (ключевой инвариант)

- **World** — размер симуляции (width/height), может быть меньше viewport ради FPS.
- **Viewport** — размер экрана/канвы (в device pixels), может меняться при resize и DPR.

Main thread обновляет viewport независимо (`SET_VIEWPORT`), а world меняет только для preset `full` (`RESIZE`).

## Протокол main ↔ worker (основное)

Main → Worker:
- `INIT` (world + viewport + optional SAB)
- `SET_VIEWPORT` (только viewport)
- `RESIZE` (только world)
- `TRANSFORM` (zoom/pan)
- `SETTINGS` (gravity / ambient / speed)
- `SET_RENDER_MODE` (`normal` | `thermal`)
- `SNAPSHOT` / `LOAD_SNAPSHOT`
- `PIPETTE`, `FILL`, `CLEAR`, `PLAY`, `PAUSE`, `STEP`

Worker → Main:
- `READY`, `STATS`, `ERROR`, `CRASH`
- `PIPETTE_RESULT`, `SNAPSHOT_RESULT`

## Фичефлаги

- Rigid Bodies: временно отключены в UI, т.к. подсистема в движке находится в состоянии stub/refactor.

