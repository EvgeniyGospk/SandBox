# ModStudio — Design & Implementation Spec (Phase 8)

> Цель документа: дать **максимально подробное** описание того, как будет устроен ModStudio (редактор модов/веществ/реакций) в Particula: навигация, UI/UX, структура данных, live‑preview песочница, сборка/валидация, импорт/экспорт и план внедрения.
>
> Этот документ специально написан как «внутреннее ТЗ», чтобы по нему можно было реализовать ModStudio без догадок.

---

## 0) Термины

- **ModStudio** — отдельная страница/режим приложения для разработки модов (packs): элементы + реакции + сборка/экспорт.
- **Pack** — набор контента: `pack.json` + `elements/*.json` + `reactions/*.json`.
- **Element file** — JSON‑описание вещества (элемента) в формате `PackElementFile`.
- **Reaction file** — JSON‑описание реакции `PackReactionFile`.
- **Runtime bundle** — единый JSON (`bundle.json`), который загружает движок (`load_content_bundle`).
- **Live Preview** — мини‑песочница (30×30 / 50×50) рядом с формой редактирования, где можно сразу тестить созданный элемент.

---

## 1) Goals / Non‑Goals

### 1.1 Goals (что обязательно)

- **Отдельная точка входа из главного меню**:
  - кнопка `ModStudio` (или `Mod Development`) в `MainMenu` рядом с `Start Simulation` и `World Settings`.
  - открывает отдельную страницу/режим (не оверлей внутри игры).

- **UI‑редактор элемента (вещества) с полным набором характеристик**:
  - все поля `PackElementFile` редактируются через UI.
  - UX не должен превращаться в «простыню» — поля группируются по секциям.

- **Live Preview mini‑canvas**:
  - мини‑мир размером **30×30 или 50×50** (настройка).
  - масштаб (zoom) повышенный, чтобы клетки были крупными.
  - возможность быстро «поспавнить» текущий элемент и посмотреть поведение.

- **Сборка и применение**:
  - изменения элемента должны приводить к сборке runtime bundle и применению в preview.
  - ошибки компиляции/валидации должны показываться пользователю (человеческие сообщения).

- **Экспорт/импорт**:
  - экспорт рабочего pack’а в `.zip`.
  - импорт `.zip` (уже реализовано в Mod Manager; в ModStudio либо переиспользуем, либо копируем UX).

### 1.2 Non‑Goals (вне первого этапа)

- Полноценный marketplace / облако / аккаунты.
- Совместная работа (multiplayer editing).
- Визуальный редактор реакций «в стиле нод/графа» (можно позже).
- Сложные симуляционные сценарии/скрипты.

---

## 2) UX Flow (пользовательские сценарии)

### 2.1 Быстрый сценарий «Создать элемент и протестировать»

1. Пользователь в главном меню нажимает `ModStudio`.
2. Открывается страница ModStudio.
3. Пользователь нажимает `New Element`.
4. В правой панели появляется форма.
5. Пользователь меняет свойства (категория, цвет, плотность, трение, поведение…).
6. В preview‑окне нажимает `Spawn` и рисует в мини‑мире.
7. Наблюдает поведение.
8. Нажимает `Export ZIP` и получает архив.

### 2.2 Сценарий «Тюнинг существующего элемента»

1. Пользователь импортирует pack (zip) в ModStudio (или открывает уже существующий workspace).
2. Выбирает элемент из списка.
3. Меняет свойства.
4. Сразу тестирует в preview.
5. Экспортирует zip.

### 2.3 Сценарий «Создать реакцию» (следующий этап)

1. Пользователь открывает вкладку `Reactions`.
2. Выбирает aggressor/victim/result.
3. Тестирует на мини‑мире (спавнит пару элементов).
4. Экспортирует zip.

---

## 3) Навигация и интеграция с текущим приложением

### 3.1 Текущее состояние

- `App.tsx` рендерит:
  - `MainMenu` когда `gameState === 'menu'`
  - игровую сцену (toolbar/panels/canvas) когда `gameState === 'playing'`

### 3.2 Предлагаемое расширение

#### Вариант A (рекомендуется): расширить `GameState`

- Расширить `GameState`:
  - `menu | playing | modStudio`
- В `useSimulationStore` добавить actions:
  - `openModStudio()`
  - `returnToMenu()` уже есть
- В `App.tsx`:
  - если `gameState === 'modStudio'` → рендерим `<ModStudioPage />`

Плюсы:
- без роутера
- консистентно с текущей архитектурой

Минусы:
- менее гибко для будущих страниц

#### Вариант B: добавить router

- React Router / wouter и роуты `/`, `/play`, `/mod-studio`.

Плюсы:
- масштабируемо

Минусы:
- больше изменений сейчас

**Для MVP: выбрать Вариант A.**

### 3.3 Кнопка в главном меню

- В `MainMenu.tsx` добавить кнопку `ModStudio`:
  - визуально в той же карточке
  - иконка: `Sparkles`/`Wrench`/`FlaskConical` (lucide)
  - при клике: `useSimulationStore.getState().openModStudio()`

---

## 4) Визуальный дизайн (UI/UX)

Док‑опора: `docs/06-ui-ux.md`.

### 4.1 Принципы

- Dark UI, как IDE.
- Всё редактирование — через UI; JSON‑режим только как advanced toggle.
- Мини‑preview всегда видим рядом, чтобы фидбек был мгновенный.
- Структура «3 панели»:
  - **Library / Workspace** (слева)
  - **Editor** (по центру)
  - **Preview** (справа)

### 4.2 Desktop Layout (предложение)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ModStudio TopBar  [Back]  ModStudio  [Pack: DraftPack v0.1]  [Export ZIP]    │
├───────────────┬──────────────────────────────────────┬───────────────────────┤
│ Library       │ Element Editor                        │ Live Preview          │
│ - Packs       │ - Sections (accordion)                │ - 50x50 cells         │
│ - Elements    │ - Form inputs                         │ - zoom x12            │
│ - Reactions   │ - Validation errors inline            │ - Play/Pause/Step     │
│ + New Element │ - Apply to Preview (auto/debounced)   │ - Brush/Fill/Eraser   │
│ + New Pack    │ - Reset draft / Undo                  │ - Clear / Reset world │
└───────────────┴──────────────────────────────────────┴───────────────────────┘
```

### 4.3 Mobile Layout (минимальный)

- Сначала показываем Editor + Preview вертикально.
- Library в виде bottom sheet.

### 4.4 Design tokens

- Использовать те же цвета:
  - `Surface #1A1A1A`, `Hover #252525`, `Border #333`.
  - акцент `#3B82F6`.
- Ошибки валидатора — красный.
- Статусы сборки (Building/Applied/Error) — баннер.

---

## 5) Data Model (как данные живут внутри ModStudio)

### 5.1 Каноничные типы

Используем уже существующие типы из:
- `apps/web/src/features/simulation/content/compilePacksToBundle.ts`
  - `PackManifest`
  - `PackElementFile`
  - `PackReactionFile`
  - `PackInput`

### 5.2 Внутренний store ModStudio

Создать отдельный Zustand store, не смешивать с `useSimulationStore`:

```ts
// псевдо
useModStudioStore = {
  // baseline: «исходная библиотека» (read-only)
  baselinePacks: PackInput[]

  // workspace: редактируемые паки
  workspacePacks: PackInput[]

  // selection
  selectedPackId: string | null
  selectedElementKey: string | null

  // editor draft
  elementDraft: PackElementFile
  elementDraftDirty: boolean

  // build status
  build: {
    status: 'idle'|'building'|'applied'|'error'
    message?: string
    lastBundleJson?: string
  }

  // preview session UI
  preview: {
    sizePreset: '30'|'50'
    zoom: number
    tool: 'brush'|'eraser'|'fill'
    brushSize: number
    isPlaying: boolean
  }
}
```

### 5.3 Почему отдельный store

- `useSimulationStore` сейчас завязан на игровую сессию (FPS, world size, backend и т.д.).
- ModStudio должен быть автономным, чтобы:
  - не ломать игру
  - иметь другой world size (50×50)
  - иметь другой набор инструментов/клавиш

---

## 6) Базовый контент: откуда берём «базу» для компиляции

### 6.1 Проблема

Чтобы `compilePacksToBundleFromParsedPacks()` работал, нужен полный набор базовых элементов (включая `base:empty` с id=0).

### 6.2 Решение для ModStudio MVP

При входе в ModStudio:
1. `fetch('/content/bundle.json')`
2. Конвертируем runtime bundle → `PackInput[]` (baseline).
3. baseline становится read‑only.
4. workspace пак (draft) накладывается сверху.

Плюсы:
- не нужны directory listing и доступ к исходникам
- гарантированно совпадает с тем, что реально загружает движок

### 6.3 Конвертация bundle → packs (алгоритм)

В runtime bundle есть:
- `packs: PackManifest[]`
- `elements[]` с полями (id/key/name/pack/…)
- `reactions[]` с полями (id/pack/aggressor/…)

Алгоритм:
- Группируем элементы по `pack`.
- Для каждого элемента формируем `PackElementFile`:
  - `kind: 'element'`
  - `id: element.id`
  - `key: element.name` (локальный)
  - `category`, `density`, `dispersion`, `bounce`, `friction`, `flags`, `behavior`, `hidden`, `ui`
  - `color` перевести из `u32` в строку `0xAARRGGBB`
  - `phaseChange`: `to` оставить в `pack:key` форме
- Группируем реакции по `pack`.
- Для реакций формируем `PackReactionFile`:
  - `kind: 'reaction'`
  - `id` локальный (без `pack:`) либо оставить полный — решить единообразно
  - `aggressor/victim/result*` как строки refs

Важно:
- baseline пак — read-only, но доступен для ссылок в UI.

---

## 7) Сборка (Build) и применение в Preview

### 7.1 Build pipeline

- Собираем список паков для сборки:
  - `baselinePacks + workspacePacks` (workspace сверху)
- Компилим:
  - `compilePacksToBundleFromParsedPacks({ packs })`
- Получаем runtime bundle JSON:
  - `JSON.stringify(bundle)`
- Применяем в preview engine:
  - `bridge.loadContentBundle(json)`

### 7.2 Когда запускать build

Два режима (переключатель в UI):
- **Auto Apply (debounced)**: при изменениях формы с debounce 250–400ms
- **Manual Apply**: кнопка `Apply to Preview`

Рекомендация для MVP:
- Auto Apply включён
- при длинных операциях/лаг — fallback на manual

### 7.3 Ошибки

Ошибки могут быть:
- некорректный JSON поля (например цвет)
- конфликт ID (duplicate)
- неизвестные ссылки в `phaseChange` или reactions

UX:
- сверху в editor — баннер `Error` + текст
- у конкретных полей — inline errors

---

## 8) Live Preview mini‑sandbox (ключевая часть)

### 8.1 Требования

- Мир 30×30 / 50×50.
- Сильный zoom, чтобы клетка была крупной.
- Мини‑панель управления preview:
  - Play/Pause
  - Step
  - Clear
  - Tool: Brush/Eraser/Fill
  - Brush size (1..10, например)
  - Quick spawn: «залить область», «вставить 5×5»

### 8.2 Реализация PreviewSession

Создать компонент `PreviewCanvas`/`PreviewSession`, который:
- поднимает отдельный backend (worker)
- держит `bridgeRef`
- не зависит от `useSimulationStore`

Важно: текущий `Canvas` сильно завязан на глобальные stores (`useSimulationStore`/`useToolStore`).
Для ModStudio нужно:
- либо вынести переиспользуемые части и сделать «параметризуемый Canvas»
- либо сделать отдельный, более простой preview‑canvas

#### MVP‑подход

Сделать отдельный `ModStudioPreviewCanvas`:
- минимальный набор:
  - init backend
  - mouse handlers для brush/eraser/fill
  - play/pause/step/clear
  - applyBundle(json) напрямую через `bridgeRef.current.loadContentBundle(json)`

### 8.3 Zoom

- В preview canvas физический мир маленький, но viewport большой.
- Рендер уже идёт на offscreen canvas; увеличить масштаб можно:
  - CSS scaling + `image-rendering: pixelated`
  - либо рендерить на canvas большего размера и выставить viewport

Рекомендация:
- Render canvas size = 500×500
- World = 50×50
- Масштаб = 10× (каждая клетка 10px)

---

## 9) UI‑редактор вещества: структура формы

### 9.1 Секции (accordion)

1. **Identity**
   - `key` (локальный)
   - `category` (select)
   - `color` (color picker + hex)
   - `hidden` (toggle)

2. **UI metadata**
   - `ui.category` (строка)
   - `ui.displayName`
   - `ui.description`
   - `ui.sort`
   - `ui.hidden`

3. **Physics**
   - `density` (number/null/Infinity)
   - `dispersion` (number)
   - `bounce` (0..1)
   - `friction` (0..1)
   - `flags.ignoreGravity`
   - `flags.rigid` (если поддерживается)

4. **Thermal**
   - `defaultTemp`
   - `heatConductivity`
   - `flags.hot / flags.cold`

5. **Lifetime / Behavior**
   - `lifetime`
   - `behavior` (string | null)

6. **Flags**
   - `flammable / conductive / corrosive`

7. **Phase Change**
   - `high.temp`, `high.to`
   - `low.temp`, `low.to`

### 9.2 Валидация полей (минимум)

- `key`:
  - required
  - `[a-z0-9_\-]+` (оговорить точный regex)
- `category`: required
- `color`: формат `0xAARRGGBB` или через UI хранить `#RRGGBB` и конвертить
- `chance` у реакций: 0..1
- `density`: число >=0 или Infinity/null

---

## 10) Workspace / Packs: как пользователи организуют работу

### 10.1 Workspace pack (draft)

- По умолчанию создаём один `draft` pack:
  - `id: 'studio'` (или `userpack`) — **важно избежать коллизий** с existing packs.
  - `title: 'Studio Draft'`
  - `version: '0.1.0'`
  - `dependencies: ['base']` (если нужно)

### 10.2 Override vs New

- Пользователь может:
  - создавать новые элементы в pack `studio`
  - (позже) «override» существующий элемент (тогда ключ `base:sand` можно переопределить)

MVP:
- фокус на **создании новых** элементов.

---

## 11) Экспорт

### 11.1 Export ZIP

- Экспортируем **workspace packs** (обычно один draft pack).
- Не включаем baseline (иначе zip огромный).
- Формат архива совместим с существующим ZIP‑импортом:
  - `<packId>/pack.json`
  - `<packId>/elements/*.json`
  - `<packId>/reactions/*.json`

### 11.2 Имена файлов

- `particula-mods-YYYY-MM-DD-HHMM.zip`

---

## 12) Риски и ограничения

- **Лимит элементов 0..255**: editor должен показывать предупреждение при приближении к лимиту.
- **Валидация ссылок** (phaseChange/reactions) — главный источник ошибок.
- **Производительность**: частый rebuild bundle может быть дорогим.
  - нужен debounce
  - нужна кнопка manual apply как fallback
- **Архитектурная зависимость текущего Canvas от глобальных stores**:
  - preview нужно сделать автономным.

---

## 13) План внедрения (milestones)

### Milestone 0 — Документация
- [x] Этот документ

### Milestone 1 — Entry point + Skeleton
- Добавить `gameState: 'modStudio'`
- Кнопка `ModStudio` в `MainMenu`
- `ModStudioPage` со skeleton layout (3 колонки)

### Milestone 2 — Preview MVP
- `ModStudioPreviewCanvas` (50×50)
- Play/Pause/Clear
- Brush/Eraser

### Milestone 3 — Build/apply pipeline
- `fetch('/content/bundle.json')` → baseline packs
- draft pack
- compile → apply to preview
- error banner

### Milestone 4 — Full element form
- Все секции из раздела 9
- inline validation

### Milestone 5 — Export ZIP
- Экспорт draft pack (fflate)

### Milestone 6 — Reactions editor (MVP)
- CRUD реакций
- apply + preview

### Milestone 7 — Polish
- hotkeys
- templates
- nicer UX for refs (autocomplete)

---

## 14) Appendix: соответствие полей (UI → JSON)

### 14.1 Element file (`PackElementFile`)

- `key` → TextInput
- `category` → Select
- `color` → ColorPicker + text
- `density` → NumberInput + mode (null/Infinity)
- `dispersion` → Slider/Number
- `lifetime` → Number
- `defaultTemp` → Number
- `heatConductivity` → Slider/Number
- `bounce` → Slider 0..1
- `friction` → Slider 0..1
- `flags.*` → Toggles
- `behavior` → Select/Text
- `phaseChange` → group
- `hidden` → Toggle
- `ui.*` → group

### 14.2 Reaction file (`PackReactionFile`)

- `id` → Text
- `aggressor` → ElementRef picker
- `victim` → ElementRef picker
- `resultAggressor` → ElementRef picker (nullable)
- `resultVictim` → ElementRef picker (nullable)
- `spawn` → ElementRef picker (nullable)
- `chance` → Slider 0..1

---

## 15) Примечание по future‑quality

В долгую ModStudio стоит довести до уровня «инструмент как IDE»:
- автодополнение ссылок `pack:key`
- подсказки по категориям/behavior
- шаблоны элементов (powder/liquid/gas)
- библиотека пресетов
- diff‑режим (override существующего элемента)
