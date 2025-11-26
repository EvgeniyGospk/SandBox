# Технологический стек Particula

## Обзор архитектуры

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   React     │  │   WebGL2    │  │   Rust → WASM       │  │
│  │   + Zustand │  │   Renderer  │  │   Physics Engine    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Server                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Node.js    │  │   Socket.io │  │   PostgreSQL        │  │
│  │  + Express  │  │   (Realtime)│  │   + Redis           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Frontend

### Core

| Технология | Назначение |
|------------|------------|
| **React** | UI framework (latest) |
| **TypeScript** | Type safety (latest) |
| **Vite** | Build tool, HMR (latest) |
| **Zustand** | State management (latest) |

### Styling

| Технология | Назначение |
|------------|------------|
| **TailwindCSS** | Utility-first CSS |
| **shadcn/ui** | UI компоненты |
| **Lucide Icons** | Иконки |
| **Framer Motion** | Анимации UI |

### Physics Engine (WASM)

| Технология | Назначение |
|------------|------------|
| **Rust** | Язык для physics engine |
| **wasm-bindgen** | Rust ↔ JS interop |
| **wasm-pack** | Build tool для WASM |
| **rayon** | Параллельные вычисления в Rust |

### Rendering

| Технология | Назначение |
|------------|------------|
| **WebGL2** | GPU-ускоренный рендеринг |
| **TWGL.js** | WebGL helper library |
| **Custom shaders** | Glow, blur эффекты |

### Storage (Client)

| Технология | Назначение |
|------------|------------|
| **IndexedDB** | Локальное сохранение сцен |
| **idb** | Promise-based IndexedDB wrapper |

## Backend

### Core

| Технология | Назначение |
|------------|------------|
| **Node.js** | Runtime (LTS) |
| **TypeScript** | Type safety (latest) |
| **Express** | HTTP framework (latest) |
| **Socket.io** | WebSocket для мультиплеера (latest) |

### Database

| Технология | Назначение |
|------------|------------|
| **PostgreSQL** | Основная БД (latest) |
| **Prisma** | ORM (latest) |
| **Redis** | Кэш, сессии, pub/sub (latest) |

### Auth

| Технология | Назначение |
|------------|------------|
| **Passport.js** | OAuth стратегии |
| **JWT** | Токены доступа |
| **bcrypt** | Хеширование паролей |

### File Storage

| Технология | Назначение |
|------------|------------|
| **MinIO** | Self-hosted S3-compatible storage |
| **Sharp** | Обработка изображений (превью сцен) |

### Validation & Security

| Технология | Назначение |
|------------|------------|
| **Zod** | Schema validation |
| **Helmet** | Security headers |
| **express-rate-limit** | Rate limiting |
| **cors** | CORS configuration |

## DevOps

### Containerization

| Технология | Назначение |
|------------|------------|
| **Docker** | Контейнеризация |
| **Docker Compose** | Оркестрация для dev |

### CI/CD

| Технология | Назначение |
|------------|------------|
| **GitHub Actions** | CI/CD pipeline |
| **ESLint** | Linting |
| **Prettier** | Code formatting |
| **Vitest** | Unit тесты |
| **Playwright** | E2E тесты |

### Monitoring

| Технология | Назначение |
|------------|------------|
| **Prometheus** | Метрики |
| **Grafana** | Дашборды |
| **Winston** | Логирование |

## Структура монорепозитория

```
particula/
├── apps/
│   ├── web/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/  # UI компоненты
│   │   │   ├── hooks/       # React hooks
│   │   │   ├── stores/      # Zustand stores
│   │   │   ├── lib/         # Утилиты
│   │   │   └── styles/      # CSS
│   │   └── public/
│   │
│   └── server/              # Node.js backend
│       ├── src/
│       │   ├── routes/      # API routes
│       │   ├── services/    # Business logic
│       │   ├── models/      # Prisma models
│       │   ├── middleware/  # Express middleware
│       │   └── socket/      # Socket.io handlers
│       └── prisma/
│
├── packages/
│   ├── engine/              # Rust physics engine
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── particle.rs
│   │   │   ├── world.rs
│   │   │   └── elements/
│   │   └── Cargo.toml
│   │
│   ├── renderer/            # WebGL renderer
│   │   └── src/
│   │
│   └── shared/              # Shared types
│       └── src/
│
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.server
│   └── docker-compose.yml
│
├── docs/                    # Документация
│
└── package.json             # Workspace root
```

## Почему эти технологии?

### Rust + WASM для физики

- **Производительность**: В 10-50x быстрее JS для числовых вычислений
- **Memory safety**: Нет утечек памяти, нет data races
- **SIMD**: Векторные операции для параллельной обработки частиц
- **wasm-bindgen**: Удобный интероп с JavaScript

### React + Zustand

- **React**: Богатая экосистема, декларативный UI
- **Zustand**: Простой API, отличная производительность, TypeScript friendly
- **Не Redux**: Меньше boilerplate, проще для real-time updates

### PostgreSQL + Redis

- **PostgreSQL**: ACID, надёжность для пользовательских данных
- **Redis**: Низкая латентность для мультиплеера, pub/sub

### WebGL2 вместо Canvas2D

- **GPU acceleration**: Критично для 500K+ частиц
- **Shaders**: Glow, blur эффекты без нагрузки на CPU
- **Instanced rendering**: Эффективный рендеринг множества частиц
