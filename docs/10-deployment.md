# Deployment Guide — Particula

## Архитектура деплоя

```
                    ┌─────────────┐
                    │   Nginx     │
                    │  (Reverse   │
                    │   Proxy)    │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │   Web    │    │   API    │    │    WS    │
    │ (Static) │    │ (REST)   │    │ (Socket) │
    │  :3000   │    │  :3001   │    │  :3002   │
    └──────────┘    └──────────┘    └──────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ PostgreSQL│    │  Redis   │    │  MinIO   │
    │  :5432   │    │  :6379   │    │  :9000   │
    └──────────┘    └──────────┘    └──────────┘
```

---

## Docker Setup

### docker-compose.yml

```yaml
version: '3.8'

services:
  # Frontend
  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:3001
      - VITE_WS_URL=ws://localhost:3002
    depends_on:
      - api

  # Backend API
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://particula:password@postgres:5432/particula
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio
      - MINIO_PORT=9000
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
      - minio

  # WebSocket server
  ws:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    command: npm run start:ws
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  # Database
  postgres:
    image: postgres:alpine  # latest
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=particula
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=particula
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # Cache & PubSub
  redis:
    image: redis:alpine  # latest
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # File Storage
  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### Dockerfile.web

```dockerfile
# Build stage
FROM node:lts-alpine AS builder  # latest LTS

WORKDIR /app

# Install Rust for WASM
RUN apk add --no-cache curl
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-pack

# Install dependencies
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/engine/Cargo.toml ./packages/engine/
RUN npm ci

# Build WASM
COPY packages/engine ./packages/engine
RUN cd packages/engine && wasm-pack build --target web

# Build frontend
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN npm run build:web

# Production stage
FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

### Dockerfile.server

```dockerfile
FROM node:lts-alpine  # latest LTS

WORKDIR /app

COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
RUN npm ci --production

COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

EXPOSE 3001 3002

CMD ["npm", "run", "start:server"]
```

---

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://host:6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=xxx
MINIO_SECRET_KEY=xxx

# Auth
JWT_SECRET=your-256-bit-secret
JWT_EXPIRES_IN=7d

# OAuth (optional)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
```

---

## Nginx Configuration

```nginx
events {
    worker_connections 1024;
}

http {
    include mime.types;
    
    # Gzip
    gzip on;
    gzip_types text/plain application/json application/javascript text/css application/wasm;
    
    upstream api {
        server api:3001;
    }
    
    upstream ws {
        server ws:3002;
    }
    
    server {
        listen 80;
        server_name particula.app;
        
        # Frontend
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
            
            # Cache static assets
            location ~* \.(js|css|wasm|png|jpg|webp)$ {
                expires 1y;
                add_header Cache-Control "public, immutable";
            }
        }
        
        # API
        location /api/ {
            proxy_pass http://api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        # WebSocket
        location /ws {
            proxy_pass http://ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

---

## Команды

### Development

```bash
# Start all services
docker-compose up -d

# Logs
docker-compose logs -f api

# Rebuild after changes
docker-compose build web
docker-compose up -d web

# Database migrations
docker-compose exec api npx prisma migrate deploy
```

### Production

```bash
# Build images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Scale WebSocket servers
docker-compose -f docker-compose.prod.yml up -d --scale ws=3
```

---

## Мониторинг

### Health Checks

```yaml
# В docker-compose.yml
api:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Prometheus Metrics

```
/metrics endpoint:
- http_requests_total
- http_request_duration_seconds
- active_websocket_connections
- active_rooms
- particles_simulated_total
```

---

## Backup

### PostgreSQL

```bash
# Backup
docker-compose exec postgres pg_dump -U particula particula > backup.sql

# Restore
docker-compose exec -T postgres psql -U particula particula < backup.sql
```

### MinIO

```bash
# Sync to external storage
mc mirror minio/scenes /backup/scenes
```

---

## SSL (Production)

```bash
# Certbot
certbot --nginx -d particula.app -d api.particula.app
```
