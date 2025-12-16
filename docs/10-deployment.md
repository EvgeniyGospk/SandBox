# Deployment Guide — Particula

## Важно: фактический скоуп репозитория

Сейчас в репозитории реально реализованы:
- `apps/web` — Vite + React фронтенд (статический билд в `apps/web/dist/`)
- `packages/engine` — Rust/WASM движок
- `packages/engine-wasm` — JS/WASM артефакты, генерируются из `packages/engine`

Backend (API/WS/DB) в текущем репозитории отсутствует. Любые схемы с PostgreSQL/Redis/MinIO и docker‑compose для “server/apps” следует считать **roadmap**, а не актуальной инструкцией.

## Build (локально/CI)

1) Установить зависимости:

```bash
npm ci
```

2) Собрать WASM артефакты (нужно один раз или при изменениях в `packages/engine`):

```bash
npm run build:wasm
```

3) Собрать фронтенд:

```bash
npm -w apps/web run build
```

Артефакт деплоя: `apps/web/dist/`.

## SharedArrayBuffer (COOP/COEP) — обязательно для SAB/threads

Если вы хотите режим с `SharedArrayBuffer` (zero‑latency input + wasm threads), прод должен отдавать заголовки:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Без них браузер отключит `SharedArrayBuffer`, и проект деградирует на медленный input‑path (postMessage).

### Готовые конфиги в репозитории

- Netlify: `apps/web/public/_headers` (попадает в `dist/` при билде). В Netlify publish directory должен указывать на `apps/web/dist/`.
- Nginx/другие static hosts: настройте эквивалентные заголовки на уровне веб‑сервера (пример ниже).

Важно: cross‑origin isolation плохо сочетается с внешними ресурсами без CORS/CORP. Поэтому по умолчанию в `apps/web/index.html` убраны Google Fonts.

## CSP / security headers (рекомендуется)

Проект — чистый SPA без backend‑surface, но базовые security headers всё равно полезны.

Минимальный пример CSP (может потребовать адаптации под ваш хостинг/бандлер):

- `Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data:; style-src 'self';`

Примечания:
- Для WebAssembly обычно требуется `'wasm-unsafe-eval'` (или `'unsafe-eval'` в некоторых окружениях).
- Если вы включаете внешние шрифты/аналитику/CDN — расширьте `style-src`/`connect-src`/`font-src` осознанно.

## Пример конфигурации Nginx (static hosting)

```nginx
server {
  listen 80;
  server_name particula.app;

  root /var/www/particula;
  index index.html;

  # Required for SharedArrayBuffer / threads
  add_header Cross-Origin-Opener-Policy same-origin always;
  add_header Cross-Origin-Embedder-Policy require-corp always;

  # Serve SPA
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache immutable assets
  location ~* \\.(js|css|wasm|png|jpg|jpeg|webp|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # WASM MIME (обычно уже есть в mime.types)
  types {
    application/wasm wasm;
  }
}
```

## Безопасность

- Не копипастить “дефолтные” пароли/ключи из старых примеров деплоя: в репозитории сейчас нет backend‑surface, но такие примеры часто мигрируют в прод по ошибке.
- Держать зависимости зафиксированными (без `"latest"`) и обновлять их через контролируемый процесс (Renovate/Dependabot).
