# Database Schema — Particula

## Overview

- **PostgreSQL 16** — основная БД
- **Redis 7** — кэш, сессии, pub/sub
- **MinIO** — файловое хранилище (S3-compatible)

---

## PostgreSQL Schema

### Users

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- NULL for OAuth users
    avatar_url VARCHAR(500),
    
    -- OAuth
    oauth_provider VARCHAR(20), -- google, github, discord
    oauth_id VARCHAR(255),
    
    -- Subscription
    tier VARCHAR(20) DEFAULT 'free', -- free, premium
    tier_expires_at TIMESTAMP,
    
    -- Stats
    total_likes_received INTEGER DEFAULT 0,
    total_scenes INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    
    UNIQUE(oauth_provider, oauth_id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
```

### Scenes

```sql
CREATE TABLE scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Metadata
    title VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Data
    data_url VARCHAR(500) NOT NULL, -- MinIO URL
    thumbnail_url VARCHAR(500),
    
    -- Settings (JSONB for flexibility)
    settings JSONB DEFAULT '{
        "width": 800,
        "height": 600,
        "gravity": {"x": 0, "y": 9.8},
        "ambientTemp": 20
    }',
    
    -- Stats
    particle_count INTEGER DEFAULT 0,
    file_size_bytes INTEGER DEFAULT 0,
    
    -- Visibility
    is_public BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    
    -- Counters
    likes_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    forks_count INTEGER DEFAULT 0,
    
    -- Relations
    forked_from_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scenes_author ON scenes(author_id);
CREATE INDEX idx_scenes_public ON scenes(is_public) WHERE is_public = true;
CREATE INDEX idx_scenes_featured ON scenes(is_featured) WHERE is_featured = true;
CREATE INDEX idx_scenes_created ON scenes(created_at DESC);
CREATE INDEX idx_scenes_likes ON scenes(likes_count DESC);
```

### Likes

```sql
CREATE TABLE likes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (user_id, scene_id)
);

CREATE INDEX idx_likes_scene ON likes(scene_id);
```

### Rooms (Multiplayer)

```sql
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(50) NOT NULL,
    join_code VARCHAR(6) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- NULL = public
    
    max_players INTEGER DEFAULT 10,
    current_players INTEGER DEFAULT 1,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(20) DEFAULT 'waiting', -- waiting, playing, closed
    
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

CREATE INDEX idx_rooms_status ON rooms(status) WHERE status != 'closed';
CREATE INDEX idx_rooms_join_code ON rooms(join_code);
```

### Room Participants

```sql
CREATE TABLE room_participants (
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    role VARCHAR(20) DEFAULT 'player', -- host, player
    joined_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (room_id, user_id)
);
```

### Refresh Tokens

```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Device info
    user_agent VARCHAR(500),
    ip_address INET
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

### Purchases (Freemium)

```sql
CREATE TABLE purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    product_type VARCHAR(50) NOT NULL, -- premium_month, element_pack_xxx
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Payment provider
    provider VARCHAR(20) NOT NULL, -- stripe, paypal
    provider_payment_id VARCHAR(255),
    
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, refunded
    
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_purchases_user ON purchases(user_id);
```

---

## Redis Structure

### Sessions

```
session:{userId} → {
    socketId: string,
    roomId: string | null,
    lastActivity: timestamp
}
TTL: 24 hours
```

### Room State

```
room:{roomId}:state → {
    particles: compressed_binary,
    settings: json,
    lastUpdate: timestamp
}
TTL: 1 hour after room closes
```

### Room Players

```
room:{roomId}:players → Set<userId>
```

### Rate Limiting

```
ratelimit:{ip}:{endpoint} → count
TTL: 60 seconds
```

### Cache

```
cache:user:{userId} → JSON user object
cache:scene:{sceneId}:meta → JSON scene metadata
TTL: 5 minutes
```

---

## MinIO Buckets

### scenes
```
scenes/
├── {userId}/
│   ├── {sceneId}/
│   │   ├── data.bin      # Compressed scene data
│   │   └── thumb.webp    # Thumbnail 400x300
```

### avatars
```
avatars/
├── {userId}.webp         # 200x200
```

---

## Prisma Schema (excerpt)

```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  username      String    @unique
  passwordHash  String?   @map("password_hash")
  avatarUrl     String?   @map("avatar_url")
  
  oauthProvider String?   @map("oauth_provider")
  oauthId       String?   @map("oauth_id")
  
  tier          String    @default("free")
  tierExpiresAt DateTime? @map("tier_expires_at")
  
  scenes        Scene[]
  likes         Like[]
  rooms         Room[]    @relation("host")
  
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  
  @@unique([oauthProvider, oauthId])
  @@map("users")
}

model Scene {
  id            String   @id @default(uuid())
  authorId      String   @map("author_id")
  author        User     @relation(fields: [authorId], references: [id])
  
  title         String
  description   String?
  dataUrl       String   @map("data_url")
  thumbnailUrl  String?  @map("thumbnail_url")
  settings      Json     @default("{}")
  
  particleCount Int      @default(0) @map("particle_count")
  isPublic      Boolean  @default(false) @map("is_public")
  
  likesCount    Int      @default(0) @map("likes_count")
  viewsCount    Int      @default(0) @map("views_count")
  
  likes         Like[]
  
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  
  @@map("scenes")
}
```
