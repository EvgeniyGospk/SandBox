# Living Sandbox Main Menu (Autoplay) — Design Doc

## 0. Контекст и цель

### Что хотим получить
Главная страница (menu) должна быть **не “обложкой”**, а **живым демо** симуляции: в фоне идёт настоящая песочница в реальном времени (worker + WASM + OffscreenCanvas), поверх — минимальный HUD:

- **Play** (главная CTA) — снизу по центру, “пластина/панель”, ощущается как часть игры.
- **Settings** — выезжающий **drawer**.
- **Thermal toggle** — переключатель рендер-режима прямо в меню.
- **Mini-telemetry** — FPS / particles (компактно).

### Важные продуктовые требования
- **Autoplay всегда** в меню (демо само “живёт”).
- **Нулевой фриз на Play**: переход меню → игра не должен пересоздавать worker/WASM.
- **Без лишней нагрузки на батарею**: когда вкладка скрыта, симуляция должна ставиться на паузу (visibility policy).

### Почему это важно технически
Сейчас worker/WASM инициализируются дорого:
- `import('@particula/engine-wasm/particula_engine')`
- `fetch('/content/bundle.json')`
- создание `World`

Если делать это при нажатии Play — будет лаг. Поэтому ключевой дизайн-инвариант:

> **Canvas + worker должны жить постоянно**, а UI должен просто переключать режимы и оверлеи.

---

## 1. Термины

- **World** — размер симуляции (width/height). Может быть меньше viewport ради FPS.
- **Viewport** — размер канвы/экрана в device pixels.
- **Backend** — абстракция `ISimulationBackend` (worker или fallback).
- **Bridge** — `WorkerBridge` (main thread API к worker).
- **Menu HUD** — UI меню поверх Canvas.
- **Demo Director** — контроллер, который генерирует “красивую” демо-сцену (autospawn + auto-reset).

---

## 2. Текущее состояние кода (точки интеграции)

### 2.1. Где рендерится меню и игра
- `apps/web/src/app/App.tsx` — условно рендерит `MainMenu` или игровой layout.

### 2.2. Текущее меню
- `apps/web/src/features/menu/ui/MainMenu.tsx`
  - сейчас использует отдельный WebGL2 shader фон (`startMenuBackground`)
  - две кнопки (Start/Settings)

### 2.3. Симуляция
- `apps/web/src/features/simulation/ui/Canvas.tsx`
  - инициализирует backend (worker или fallback)
  - подписывается на stats и обновляет `fps`, `particleCount`

### 2.4. Store
- `apps/web/src/features/simulation/model/simulationStore.ts`
  - `gameState: 'menu' | 'playing'`
  - `isPlaying`
  - `toggleRenderMode`
  - `worldSizePreset`

### 2.5. Worker init
- `apps/web/src/features/simulation/worker/init.ts`
  - грузит WASM, bundle, создаёт мир, включает render loop

### 2.6. Ограничение OffscreenCanvas
Canvas после передачи в worker нельзя “перекинуть обратно” без полной реинициализации.

**Следствие**: должен быть один DOM canvas и он должен жить постоянно.

---

## 3. High-level архитектура решения

### 3.1. Новый layout
**Canvas должен быть всегда смонтирован**, а сверху меняется только UI:

- `SimulationViewport` (новый композиционный компонент)
  - `CanvasLayer` — `<Canvas />` (живёт всегда)
  - `OverlayLayer` — условные оверлеи:
    - `MenuHUD` (menu + transition)
    - `GameHUD` (playing)

### 3.2. Режимы приложения (рекомендуемая модель)
Чтобы сделать кинематографичный переход:

- `menu` — autoplay демо + меню HUD
- `transition_to_play` — исчезание HUD + камера + подготовка UI игры
- `playing` — полный UI игры

Реализация может быть:
- расширение `gameState` в `simulationStore`,
- или отдельный UI-store для меню.

**Рекомендация**: расширить `gameState` (просто и прозрачно).

---

## 4. Autoplay + visibility policy (battery safe)

### 4.1. Требование
В меню симуляция всегда “крутится”. Но при скрытии вкладки — пауза.

### 4.2. Политика
Добавляем глобальный обработчик `visibilitychange`:

- Если `document.hidden === true`:
  - если симуляция была в `isPlaying=true`, ставим `pausedByVisibility=true`
  - вызываем `backend.pause()`
  - обновляем `isPlaying=false`

- Если `document.hidden === false`:
  - если `pausedByVisibility=true`:
    - если `gameState === 'menu'` → `backend.play()` (обязательно)
    - если `gameState === 'playing'` → `backend.play()` только если пользователь не нажимал Pause вручную (см. ниже)

### 4.3. Разделение “пауза пользователем” vs “пауза системой”
Рекомендуется добавить в store/контроллер:

- `pausedByVisibility: boolean`
- `pausedByUser: boolean`

Правило:
- если пользователь нажал Pause → `pausedByUser=true`
- visibility pause не должен “перебивать” решение пользователя.

Минимально допустимый MVP:
- в `playing` можно **не** авто-resume, чтобы не ломать ожидания.
- в `menu` авто-resume обязательно.

---

## 5. Demo Mode (autoplay сцена)

### 5.1. Цель демо
- выглядит как трейлер
- всегда динамичная
- самовосстанавливается
- не убивает FPS

### 5.2. Архитектура
`DemoDirector` — модуль, который активен только когда `gameState === 'menu'`:

- запускает `backend.play()` (если нужно)
- выполняет “сценарий” автоспавна
- следит за `fps` и `particleCount`
- при перегрузе снижает интенсивность или делает reset

### 5.3. Почему это лучше делать без второго рендера
Нельзя запускать параллельно второй WebGL фон и симуляцию — двойная нагрузка.

**Инвариант**:
> В меню есть только один “дорогой” рендер — симуляция.

### 5.4. Интенсивность (adaptive)
Определяем `demoIntensity` по FPS:

- `high`: FPS ≥ 55
- `medium`: 35..54
- `low`: < 35

Что меняется:
- spawn rate
- радиус кисти
- частота “эффектных” событий (acid, fire)

### 5.5. Caps / auto-reset
- `particleCap` подбирается по пресету мира:
  - tiny/small: выше (демо плотнее)
  - medium: средний
  - large/full: ниже (иначе дорого)

Пример (стартовые значения, потом калибруются):
- tiny: 220k
- small: 200k
- medium: 160k
- large: 120k
- full: 100k

Если `particleCount > particleCap`:
- `backend.clear()`
- короткая пауза 150–300ms
- рестарт сценария

### 5.6. Демо-сцены (рекомендуется 3)
**Scene A: Waterfall**
- “источник песка” сверху
- “вода” сбоку
- bowl из stone/metal

**Scene B: Acid vs Metal**
- остров metal
- редкие “капли” acid
- красиво демонстрирует реакции (`acid_metal`)

**Scene C: Thermal Showcase**
- горячая зона + жидкости/переходы
- идеальна для демонстрации thermal toggle

Выбор:
- случайный на входе в меню
- или переключатель “demo preset” в drawer (не обязательно в MVP)

### 5.7. Где исполнять сценарий
**MVP (без изменения протокола worker):**
- сценарий в main thread: таймеры вызывают `bridge.handleInput(...)`

**Идеал (позже):**
- добавить worker-сообщения `RUN_DEMO_SCENE` / `SET_DEMO_MODE`

---

## 6. Menu HUD (UI поверх живой сцены)

### 6.1. Состав HUD
- Bottom-center: **Play** CTA
- Bottom-corner: **Settings**
- рядом: **Thermal toggle**
- Top-corner: мини-телеметрия (FPS/particles)

### 6.2. Состояния кнопки Play
- `Engine initializing…` (пока `Canvas` показывает isLoading)
- `Play` (готово)

### 6.3. Меню-интерактив (лёгкий)
Цель: “вау” без полного редактора.

Рекомендуемый набор:
- drag/swipe: “сдув/смахнуть” (серия коротких eraser/brush штрихов)
- tap: “капля” песка/воды
- long press: “источник” пока удерживаешь

**Важно**: инпут меню должен быть **изолирован** от toolStore игры.

Рекомендация:
- в `menu` не использовать инструменты Canvas (brush/eraser из UI игры)
- обрабатывать pointer events в `MenuHUD` и напрямую дергать `bridge.handleInput()`

---

## 7. Settings Drawer (world size preview + apply)

### 7.1. Почему нельзя ресайзить мир на каждый клик
Worker `RESIZE` делает:
- `new World(w,h)` (reset)
- пересоздание буферов/канвасов

Это heavy → микрофризы.

### 7.2. UX паттерн
- Выбор preset меняет **preview** (рамка/маска), но не меняет мир.
- Кнопка **Apply** применяет реальный `setWorldSizePreset`.

### 7.3. Preview без ресайза
- поверх Canvas рисуем рамку будущего размера
- вокруг рамки — затемнение (mask)
- подпись: “768×576, ~60 FPS”

### 7.4. Доп. настройки (опционально)
- Demo Scene selector
- Demo intensity (auto/manual)
- Toggle “pause demo while drawer open”

---

## 8. Cinematic transition menu → playing

### 8.1. Последовательность
1) Play click → `gameState = transition_to_play`
2) HUD fade/blur (0..400ms)
3) Camera animation (200..900ms)
4) Поднятие игрового UI
5) `gameState = playing`

### 8.2. Камера
В worker есть transform (`bridge.setTransform(zoom, panX, panY)`), значит можно:
- плавно заанимировать zoom/pan на main thread через rAF

### 8.3. Важно про симуляцию
- симуляция уже крутится (autoplay), поэтому “Play” не должен делать тяжелых init.
- “Play” переключает режим UI и управление.

---

## 9. Переход playing → menu (ESC)

Сейчас `returnToMenu()` делает `backend.pause()` и `isPlaying=false`.

Но по требованиям меню должно autoplay.

Рекомендованный флоу:
- `returnToMenu()` переключает UI в `menu`
- `DemoDirector` на входе в меню:
  - включит `backend.play()`
  - запустит демо-сцену

---

## 10. Производительность и стабильность

### 10.1. Источники лагов
- первичная инициализация WASM/bundle
- resize world
- неконтролируемый рост частиц

### 10.2. Стратегия
- Canvas/worker инициализировать **сразу при старте приложения**
- в меню демо ограничивать `particleCount`
- в фоне вкладки — pause

### 10.3. Fallback
Worker уже имеет fallback (Canvas2D). В меню HUD можно отображать мягкое предупреждение:
- “Performance mode limited (COOP/COEP disabled)”

---

## 11. План внедрения (по этапам)

### Milestone 1 — Canvas всегда жив
- Рефактор `App.tsx`: `Canvas` монтируется всегда.
- Убрать `key={gameState}` с Canvas, чтобы React не размонтировал компонент.

**Критерий успеха**: нажал Play — нет повторной загрузки WASM.

### Milestone 2 — Menu HUD поверх Canvas
- Новый `MainMenuHUD`.
- Удалить шейдерный фон меню (`startMenuBackground`).

### Milestone 3 — DemoDirector (autoplay)
- Сценарии A/B/C.
- Adaptive intensity.
- Auto-reset по caps.
- visibility policy.

### Milestone 4 — Drawer + preview + apply
- Drawer UI.
- Preview mask.
- Apply-only resize.

### Milestone 5 — Cinematic transition
- `transition_to_play`.
- Fade/blur HUD.
- Camera animation.

---

## 12. Чеклист тестов (QA)

### UX
- загрузка → демо сразу идёт
- Play → плавный переход, без “грузится заново”
- Settings drawer не ломает инпут/камера

### Performance
- через 2–3 минуты демо не деградирует в 5 FPS
- particleCount стабилизируется (авто-reset работает)

### Visibility
- свернул вкладку → CPU usage падает (pause)
- вернулся → демо продолжилось

### World size
- выбор preset → меняется preview, мир не ресайзится
- Apply → ресайз один раз

---

## 13. Риски и митигации

- **Двойная нагрузка GPU** (если оставить шейдер фон) → убрать фон, оставить только симуляцию.
- **Микрофризы при resize** → Apply-only.
- **Конфликты меню-инпута и инструментов игры** → изоляция menu input (не через toolStore).
- **Низкий FPS на слабых девайсах** → adaptive intensity + caps.

---

## 14. Ссылки на ключевые файлы

- `apps/web/src/app/App.tsx`
- `apps/web/src/features/menu/ui/MainMenu.tsx`
- `apps/web/src/features/simulation/ui/Canvas.tsx`
- `apps/web/src/features/simulation/model/simulationStore.ts`
- `apps/web/src/features/simulation/worker/init.ts`
- `apps/web/src/features/simulation/engine/worker/WorkerBridgeImpl.ts`

---

## 15. Примечание по стилю UI

Ориентируемся на существующий UI язык проекта (см. `docs/06-ui-ux.md`):
- Dark surfaces `#1A1A1A`
- Border `#333`
- Accent `#3B82F6`
- аккуратные радиусы/тени

Но в меню делаем “дороже”:
- больше воздуха
- кинематографичные анимации
- “панель/пластина” для Play вместо карточки

