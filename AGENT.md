# AGENT.md — Particula (EvgeniyGospk/SandBox)

Этот файл предназначен для **ИИ‑агента**, который начинает работу с репозиторием и должен быстро понять:

- что за проект и какой у него реальный скоуп в этом репо;
- как устроена монорепа (папки/пакеты/скрипты);
- как запускается web‑приложение и как собирается Rust/WASM;
- как устроен контент (elements/reactions) и как генерируется runtime `bundle.json`;
- какие есть критичные инварианты и какие файлы **автогенерируются** (их нельзя править вручную).

---

## 1) Что это за проект

**Particula** — 2D sandbox‑симуляция частиц в браузере (в духе The Powder Toy / Sandbox). Текущая кодовая база в этом репозитории реально содержит:

- `apps/web` — frontend (Vite + React + TS)
- `packages/engine` — движок симуляции на Rust (сборка в WASM)
- `packages/engine-wasm` — сгенерированные артефакты JS/WASM для фронта
- `content/packs/*` — “паки” контента (элементы/реакции) в JSON

Важно:

- Backend (API/WS/DB) здесь **не реализован** и относится к roadmap/докам.

Документация (актуальная по факту репозитория): `docs/`.

---

## 2) Монорепа: верхний уровень

Корень репозитория:

- `apps/`
  - `web/` — основной frontend
- `packages/`
  - `engine/` — Rust/WASM движок
  - `engine-wasm/` — build output (JS/WASM bindings) для web
- `content/`
  - `packs/` — пакеты контента, которые компилируются в единый runtime bundle
- `definitions/` — **legacy** JSON определения (исторический источник для codegen)
- `scripts/` — node‑скрипты для сборки контента, codegen и обеспечения артефактов
- `docs/` — проектные и архитектурные заметки
- `package.json` — корневые npm scripts + workspaces
- `turbo.json` — orchestrator задач (Turbo)
- `rust-toolchain.toml` — pinned Rust toolchain

Workspaces:

- npm workspaces: `apps/*`, `packages/*`
- turbo tasks: `dev`, `build`, `lint`, `clean`

---

## 3) Быстрый старт (локально)

### 3.1 Установка зависимостей

Из корня:

- `npm ci`

### 3.2 Сборка WASM артефактов

Если нет `packages/engine-wasm/*` или ты меняешь Rust‑движок:

- `npm run build:wasm`

Примечание:

- В `apps/web` есть `predev`/`prebuild`, которые запускают `scripts/ensure-engine-wasm.mjs` и **упадут**, если артефактов нет.

### 3.3 Запуск web (dev)

Варианты:

- из корня: `npm run dev` (turbo)
- или точечно: `npm -w apps/web run dev`

Vite dev server по умолчанию: `http://localhost:3000`.

---

## 4) Архитектура рантайма (UI ↔ Worker ↔ WASM)

Высокоуровнево:

- **Main thread (React UI)**
  - UI, Zustand state
  - камера/координаты/инпут
  - инициализация и управление worker
- **Worker thread**
  - инициализация WASM
  - tick loop симуляции
  - рендер в `OffscreenCanvas`
  - обработка input (быстрый путь через `SharedArrayBuffer`, fallback через `postMessage`)
- **Rust/WASM (packages/engine)**
  - хранение мира и симуляция
  - экспорт WASM API

Ключевой принцип (см. `docs/04-architecture.md`):

- **World** — размер симуляции (width/height), может отличаться от viewport ради FPS
- **Viewport** — размер канвы/экрана, меняется при resize/DPR

SharedArrayBuffer:

- Для SAB/threads нужны COOP/COEP заголовки.
- Dev server выставляет их через `apps/web/vite.config.ts`.
- Для продакшена см. `docs/10-deployment.md`.

---

## 5) Контент: packs → runtime bundle

### 5.1 Где лежит контент

Актуальный формат контента — папка `content/packs/*`.

Пример: `content/packs/base/`:

- `pack.json` — манифест пака
- `elements/*.json` — элементы
- `reactions/*.json` — реакции

### 5.2 Пак (pack.json)

`content/packs/<packId>/pack.json`:

- `formatVersion: 1`
- `id: string` (например `base`)
- `title: string`
- `version: string`
- `dependencies: string[]` — зависимости на другие паки

Порядок подключения/слияния паков определяется топологической сортировкой зависимостей.

### 5.3 Файл элемента

`content/packs/<packId>/elements/<name>.json` — объект вида:

- `kind: "element"`
- `key: string` — локальный ключ (без `pack:`), например `stone`
- `id?: number` — опциональный **явный** ID (0..255)
- `category: string` — например `solid | powder | liquid | gas | energy | utility | bio`
- `color: string` — `0xAARRGGBB`
- `density: number | "Infinity" | null`
- `dispersion, lifetime, defaultTemp, heatConductivity`
- `bounce?, friction?` — если не заданы, берутся defaults по category
- `flags?` — булевые флаги (flammable/conductive/corrosive/hot/cold/ignoreGravity/rigid)
- `behavior?: string | null`
- `phaseChange?: { high?, low? } | null` — ссылки на элементы по ключу
- `ui?: {...} | null`

После компиляции контента все element refs нормализуются к виду `pack:key`.

### 5.4 Файл реакции

`content/packs/<packId>/reactions/<id>.json` — объект вида:

- `kind: "reaction"`
- `id: string` — локальный id реакции
- `aggressor: string` — element ref
- `victim: string` — element ref
- `resultAggressor: string | null`
- `resultVictim: string | null`
- `spawn: string | null`
- `chance: number` — 0..1
- `comment?: string`

Семантика destroy:

- `resultVictim: null` при компиляции нормализуется в `base:empty`.

### 5.5 Компиляция packs в runtime bundle

Есть два пути:

1) **Node‑скрипт сборки контента** (репозиторный, для поставки контента в web):

- `scripts/compile-content.mjs`
- вход: `content/packs/*` (+ опционально legacy `definitions/*`)
- выход: `apps/web/public/content/bundle.json`

Важные детали из `scripts/compile-content.mjs`:

- merge элементов:
  - сохраняет ID из legacy (если включено)
  - pack‑элементы могут **override** существующий `key` (ID должен совпадать)
  - новые элементы получают следующий свободный ID
- ID пространство: **0..255**, при переполнении выбрасывает ошибку
- после присвоения ID:
  - резолвит `phaseChange.*.toId`
  - резолвит реакции в `aggressorId/victimId/...`
- merge реакций:
  - ключ реакции: `(aggressor, victim)`
  - “поздние” паки override “ранние” для одной пары

Legacy bridge:

- legacy `definitions/elements.json` + `definitions/reactions.json` подключаются только если:
  - `CONTENT_INCLUDE_LEGACY=1` или `CONTENT_INCLUDE_LEGACY=true`

2) **Browser‑компиляция packs из directory upload** (для UI импорта модов/паков):

- `apps/web/src/features/simulation/content/compilePacksToBundle.ts`
- читает выбранную папку(и) в браузере (directory upload)
- собирает runtime bundle того же формата (formatVersion 1)

Инвариант:

- ожидается `base:empty` имеет `id === 0` (см. `compilePacksToBundle.ts`).

---

## 6) Legacy definitions и codegen (важно)

В репозитории исторически есть pipeline генерации кода из `definitions/*.json`:

- вход:
  - `definitions/elements.json`
  - `definitions/reactions.json`
- генерация:
  - `packages/engine/src/domain/generated_elements.rs`
  - `apps/web/src/core/engine/generated_elements.ts`

Скрипт:

- `scripts/generate-elements.js`
- запускается через `npm run codegen`

Критично:

- **НЕ редактируй вручную**:
  - `apps/web/src/core/engine/generated_elements.ts`
  - `packages/engine/src/domain/generated_elements.rs`

Если нужно менять schema/данные для codegen — меняется `definitions/*.json` и прогоняется `npm run codegen`.

---

## 7) Rust/WASM engine

### 7.1 Где лежит код

- `packages/engine/src/` — основная логика симуляции
- `packages/engine/tests/` — тесты (если есть)

Toolchain:

- pinned Rust: см. `rust-toolchain.toml` (например `1.92.0`)

Features:

- `parallel` включает `rayon` + `wasm-bindgen-rayon`.

### 7.2 Как собирается WASM

Скрипты:

- `packages/engine/build-standard.sh`
  - stable, без parallel, совместимее (в т.ч. Node benchmarks)
- `packages/engine/build-parallel.sh`
  - nightly, atomics/threads, опционально `wasm-opt`

Корневые npm scripts:

- `npm run build:wasm` → codegen + `packages/engine/build-standard.sh`
- `npm run build:wasm:parallel` → codegen + `packages/engine/build-parallel.sh`

Результат сборки:

- `packages/engine-wasm/particula_engine*.{js,wasm,d.ts}`

---

## 8) Web: где искать “точки входа”

Если ты ИИ‑агент и тебе нужно быстро понять web‑часть, обычно полезно начать с:

- `apps/web/src/main.tsx` / `apps/web/src/App.tsx` (точка входа UI)
- `apps/web/src/features/simulation/` (основная фича симуляции)
- `apps/web/src/features/simulation/engine/worker/` (worker bridge, протокол)
- `apps/web/src/features/simulation/worker/` (инициализация воркера, загрузка контента)
- `apps/web/src/features/simulation/ui/` (Canvas, панели, тулбары)

Поиск по коду:

- ищи `WorkerBridge` и обработчики сообщений/команд
- ищи `bundle.json` и загрузку `public/content/bundle.json`

---

## 9) Генерируемые / производные файлы (НЕ ПРАВИТЬ ВРУЧНУЮ)

- `apps/web/src/core/engine/generated_elements.ts` — генерируется `scripts/generate-elements.js`
- `packages/engine/src/domain/generated_elements.rs` — генерируется `scripts/generate-elements.js`
- `packages/engine-wasm/*` — генерируется сборкой WASM (`npm run build:wasm`)
- `apps/web/public/content/bundle.json` — генерируется `scripts/compile-content.mjs`

Правки нужно вносить в источники:

- контент: `content/packs/*`
- legacy codegen‑источник: `definitions/*`
- engine: `packages/engine/src/*`
- web: `apps/web/src/*` (кроме codegen файла выше)

---

## 10) Ключевые инварианты и "грабли"

- **ElementId = u8**:
  - максимум 256 элементов (`0..255`)
  - при переполнении сборка падает с ошибкой
- **`base:empty` должен иметь `id = 0`**:
  - на этом завязаны семантики “destroy” и некоторые быстрые пути
- Ссылки на элементы в phaseChange/reactions:
  - при компиляции должны резолвиться в существующие ключи
  - после компиляции появляются `toId`, `aggressorId`, `victimId`, ...
- `SharedArrayBuffer` требует COOP/COEP:
  - dev уже выставляет
  - прод нужно настроить хостингом (см. `docs/10-deployment.md`)

---

## 11) Типовые задачи (как действовать)

### Добавить новый элемент (packs)

- создать файл `content/packs/<packId>/elements/<key>.json` с `kind: "element"`
- при необходимости закрепить `id` (0..255), иначе он будет выделен автоматически
- если элемент referenced в `phaseChange`/reactions — убедиться, что ключи корректные
- прогнать `npm run content:build` (или вызвать `scripts/compile-content.mjs`) чтобы обновить `apps/web/public/content/bundle.json`

### Добавить/изменить реакцию

- создать/изменить `content/packs/<packId>/reactions/<id>.json`
- помнить: `resultVictim: null` → будет интерпретировано как destroy (`base:empty`)

### Изменить Rust engine

- править `packages/engine/src/*`
- пересобрать `npm run build:wasm`

### Отладить проблемы с загрузкой/работой WASM

- проверить, что `packages/engine-wasm/*` существует (иначе `ensure-engine-wasm.mjs` валит dev)
- помнить про COOP/COEP для SAB/threads

---

## 12) Ориентиры по документам

- `docs/01-overview.md` — overview и скоуп
- `docs/03-tech-stack.md` — фактический стек
- `docs/04-architecture.md` — архитектура UI↔worker↔WASM
- `docs/10-deployment.md` — деплой + COOP/COEP

