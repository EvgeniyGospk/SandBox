# Архитектура Particula

## Принципы проектирования

### SOLID

| Принцип | Применение |
|---------|-----------|
| **S** — Single Responsibility | Каждый модуль = одна задача |
| **O** — Open/Closed | Новые элементы через `ElementDefinition` без изменения ядра |
| **L** — Liskov Substitution | Все элементы реализуют `IElement` |
| **I** — Interface Segregation | Маленькие интерфейсы: `IRenderable`, `IBurnable`, `IConductive` |
| **D** — Dependency Inversion | DI контейнер, зависимости через абстракции |

### Design Patterns

| Паттерн | Применение |
|---------|-----------|
| **ECS** | Архитектура частиц |
| **Strategy** | Типы взаимодействий элементов |
| **Observer** | События (взрывы, смерть) |
| **Factory** | Создание частиц |
| **Object Pool** | Переиспользование частиц |
| **Command** | Undo/Redo рисования |
| **State** | Состояния симуляции |

---

## ECS Architecture (Rust/WASM)

```
World
├── Entities: [Particle₀, Particle₁, ... Particleₙ]
│
├── Components (Structure of Arrays):
│   ├── positions_x: Vec<f32>
│   ├── positions_y: Vec<f32>
│   ├── velocities_x: Vec<f32>
│   ├── velocities_y: Vec<f32>
│   ├── element_types: Vec<u8>
│   ├── temperatures: Vec<f32>
│   ├── pressures: Vec<f32>
│   ├── voltages: Vec<f32>
│   ├── resistances: Vec<f32>
│   └── colors: Vec<u32>
│
└── Systems (Pipeline):
    1. InputSystem      ← User input
    2. GravitySystem    ← Apply gravity
    3. PressureSystem   ← Calculate pressure
    4. MovementSystem   ← Update positions
    5. CollisionSystem  ← Resolve overlaps
    6. HeatSystem       ← Transfer heat
    7. ReactionSystem   ← Chemical reactions
    8. ElectricSystem   ← Current flow
    9. CleanupSystem    ← Remove dead particles
```

### Spatial Partitioning

```
┌─────┬─────┬─────┬─────┐
│ 0,0 │ 1,0 │ 2,0 │ 3,0 │  Cell size = 4-8 px
├─────┼─────┼─────┼─────┤  O(1) neighbor lookup
│ 0,1 │ 1,1 │ 2,1 │ 3,1 │  Efficient collision
├─────┼─────┼─────┼─────┤
│ 0,2 │ 1,2 │ 2,2 │ 3,2 │
└─────┴─────┴─────┴─────┘
```

---

## Frontend Architecture

### Component Tree

```
App
├── Layout
│   ├── LeftPanel (Elements)
│   │   ├── CategoryTabs
│   │   └── ElementGrid
│   │
│   ├── TopToolbar
│   │   ├── BrushTools
│   │   ├── BrushSizeSlider
│   │   └── Eraser, Pipette, Fill
│   │
│   ├── Canvas (WebGL)
│   │
│   ├── RightPanel (Settings)
│   │   ├── GravityControl
│   │   └── TemperatureControl
│   │
│   └── BottomBar
│       ├── PlayPause, Step, Speed
│       └── FPSCounter
│
└── Modals (Save, Load, Settings, Share)
```

### Zustand Stores

```typescript
// simulationStore
{
  isPlaying: boolean,
  speed: 0.5 | 1 | 2 | 4,
  fps: number,
  gravity: { x, y },
  ambientTemperature: number
}

// toolStore
{
  selectedTool: 'brush' | 'eraser' | 'pipette' | 'fill',
  brushShape: 'circle' | 'square' | 'line',
  brushSize: number,
  selectedElement: ElementType
}

// sceneStore
{
  currentScene: Scene | null,
  isDirty: boolean,
  localScenes: Scene[],
  cloudScenes: Scene[]
}
```

---

## Backend Architecture

```
┌─────────────────────────────────────────┐
│              API Gateway                 │
│         (Express + Rate Limit)          │
└─────────────────┬───────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│  Auth  │  │  Scenes  │  │ Realtime │
│Service │  │ Service  │  │ Service  │
└───┬────┘  └────┬─────┘  └────┬─────┘
    │            │              │
    ▼            ▼              ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │  MinIO   │  │  Redis   │
│ (Users) │  │ (Files)  │  │ (PubSub) │
└─────────┘  └──────────┘  └──────────┘
```

### Multiplayer Flow

```
Client A                Server              Client B
   │                      │                    │
   │── draw(particles) ──▶│                    │
   │                      │── broadcast ──────▶│
   │                      │                    │
   │◀── sync(state) ──────│◀── draw(p) ───────│
   │                      │                    │
   │── request(state) ───▶│                    │
   │◀── full_sync ────────│                    │
```

Server авторитетный: валидирует все действия, синхронизирует состояние.
