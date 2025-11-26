# Roadmap — Particula

## Версии и сроки

```
v1.0 MVP          ████████░░░░░░░░░░░░  4-6 недель
v1.5 Cloud        ░░░░░░░░████████░░░░  +3-4 недели
v2.0 Multiplayer  ░░░░░░░░░░░░░░░░████  +4-6 недель
```

---

## v1.0 — MVP

### Цель
Рабочий прототип с базовой физикой и 14 элементами.

### Функционал

#### Core
- [ ] Rust physics engine (WASM)
- [ ] WebGL2 renderer
- [ ] 14 базовых элементов
- [ ] Температура для каждой частицы
- [ ] Базовое давление
- [ ] Настраиваемая гравитация

#### UI
- [ ] Dark theme interface
- [ ] Left panel: элементы по категориям
- [ ] Top toolbar: кисти, размер, ластик
- [ ] Bottom bar: play/pause, speed, FPS
- [ ] Right panel: настройки мира
- [ ] Responsive (desktop + mobile)

#### Tools
- [ ] Кисти: круг, квадрат, линия
- [ ] Размер: 1-50px
- [ ] Ластик
- [ ] Пипетка
- [ ] Заливка

#### Saving
- [ ] Локальное сохранение (IndexedDB)
- [ ] Export/Import JSON

#### DevOps
- [ ] Docker setup
- [ ] Basic CI/CD

### Технические задачи

```
Week 1-2: Foundation
├── Setup monorepo (Turborepo)
├── Rust/WASM physics skeleton
├── React + Vite + TailwindCSS setup
├── WebGL2 renderer prototype
└── Basic particle simulation

Week 3-4: Core Physics
├── Implement all 14 elements
├── Temperature system
├── Pressure system
├── Collision detection (spatial hash)
├── Reactions matrix
└── Performance optimization

Week 5-6: UI & Polish
├── Complete UI components
├── Mobile responsive
├── Local saving
├── Docker containerization
└── Testing & bug fixes
```

---

## v1.5 — Cloud & Social

### Цель
Аккаунты, облачное сохранение, галерея.

### Функционал

#### Backend
- [ ] Node.js + Express API
- [ ] PostgreSQL + Prisma
- [ ] Redis caching
- [ ] MinIO file storage

#### Auth
- [ ] Email + password
- [ ] OAuth (Google, GitHub, Discord)
- [ ] JWT tokens
- [ ] Guest mode

#### Cloud Features
- [ ] Cloud save/load
- [ ] Sync across devices
- [ ] Scene thumbnails

#### Social
- [ ] Public gallery
- [ ] Like scenes
- [ ] Fork scenes
- [ ] User profiles
- [ ] Search & filters

#### New Elements (+10)
- [ ] Ice
- [ ] Glass
- [ ] Acid
- [ ] Gunpowder
- [ ] TNT
- [ ] Wire
- [ ] Battery
- [ ] LED
- [ ] Plant
- [ ] Seed

### Технические задачи

```
Week 1-2: Backend
├── API server setup
├── Database schema
├── Auth system
└── File storage

Week 3-4: Integration
├── Frontend auth flow
├── Cloud save/load
├── Gallery UI
├── New elements
└── Testing
```

---

## v2.0 — Multiplayer & Advanced

### Цель
Real-time мультиплеер, DSL, AI существа.

### Функционал

#### Multiplayer
- [ ] Room creation/joining
- [ ] Real-time sync (WebSocket)
- [ ] Up to 10 players
- [ ] Text chat
- [ ] Authoritative server

#### DSL Editor
- [ ] Simple scripting language
- [ ] Define custom elements
- [ ] Share custom elements
- [ ] Syntax highlighting

#### Creatures
- [ ] Basic AI (pathfinding)
- [ ] Hunger, health, fear
- [ ] Reproduction
- [ ] Genetic mutations
- [ ] Evolution over generations

#### Advanced Physics
- [ ] Realistic electricity (Ohm's law)
- [ ] Fluid pressure (Navier-Stokes simplified)
- [ ] Heat radiation
- [ ] Sound waves (optional)

#### Monetization
- [ ] Stripe integration
- [ ] Premium subscription
- [ ] Element packs
- [ ] Ad-free option

### Технические задачи

```
Week 1-2: Multiplayer
├── Socket.io setup
├── State synchronization
├── Conflict resolution
├── Room management
└── Chat system

Week 3-4: DSL & Creatures
├── DSL parser
├── DSL interpreter (WASM)
├── Creature AI system
├── Genetics engine
└── UI for DSL editor

Week 5-6: Polish
├── Monetization
├── Performance tuning
├── Load testing
├── Documentation
└── Launch preparation
```

---

## Метрики успеха

### v1.0
- [ ] 60 FPS при 100K частиц
- [ ] < 3 сек загрузка
- [ ] Работает на iOS Safari

### v1.5
- [ ] 1000 зарегистрированных пользователей
- [ ] 100 публичных сцен
- [ ] 99.9% uptime API

### v2.0
- [ ] 100 concurrent multiplayer sessions
- [ ] 10 custom DSL элементов от комьюнити
- [ ] Первые платящие пользователи

---

## Риски и митигация

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| WASM слишком сложен | Medium | Fallback на TS с меньшим количеством частиц |
| Производительность не достигнута | Medium | Адаптивное качество |
| Мультиплеер lag | High | Delta compression, prediction |
| Низкий интерес пользователей | Medium | Фокус на уникальных фичах (DSL, эволюция) |
