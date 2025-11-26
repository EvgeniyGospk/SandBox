# API Documentation — Particula

## Base URL

```
Production: https://api.particula.app/v1
Development: http://localhost:3001/v1
```

## Authentication

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

---

## Endpoints

### Auth

#### POST /auth/register
```json
// Request
{
  "email": "user@example.com",
  "password": "securepassword",
  "username": "username"
}

// Response 201
{
  "user": { "id": "uuid", "email": "...", "username": "..." },
  "token": "jwt_token"
}
```

#### POST /auth/login
```json
// Request
{ "email": "user@example.com", "password": "..." }

// Response 200
{ "user": {...}, "token": "jwt_token" }
```

#### POST /auth/oauth/:provider
Providers: `google`, `github`, `discord`

#### POST /auth/logout
Invalidates refresh token.

#### GET /auth/me
Returns current user.

---

### Scenes

#### GET /scenes
```json
// Query params: ?page=1&limit=20&sort=created_at&order=desc

// Response 200
{
  "scenes": [
    {
      "id": "uuid",
      "title": "My Scene",
      "thumbnail": "https://...",
      "particleCount": 50000,
      "isPublic": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "author": { "id": "...", "username": "..." }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 100 }
}
```

#### GET /scenes/:id
```json
// Response 200
{
  "id": "uuid",
  "title": "...",
  "description": "...",
  "data": "base64_encoded_scene_data",
  "settings": {
    "width": 800,
    "height": 600,
    "gravity": { "x": 0, "y": 9.8 },
    "ambientTemp": 20
  },
  "isPublic": true,
  "likes": 42,
  "views": 1000,
  "author": {...}
}
```

#### POST /scenes
```json
// Request
{
  "title": "My Scene",
  "description": "Optional",
  "data": "base64_encoded",
  "settings": {...},
  "isPublic": false
}

// Response 201
{ "id": "uuid", ... }
```

#### PUT /scenes/:id
Update scene (owner only).

#### DELETE /scenes/:id
Delete scene (owner only).

#### POST /scenes/:id/like
Toggle like.

#### POST /scenes/:id/fork
Create copy of public scene.

---

### Gallery

#### GET /gallery
```json
// Query: ?sort=popular|recent|trending&category=all

// Response 200
{
  "scenes": [...],
  "pagination": {...}
}
```

#### GET /gallery/featured
Curated scenes by admins.

---

### Rooms (Multiplayer)

#### GET /rooms
```json
// Response 200
{
  "rooms": [
    {
      "id": "uuid",
      "name": "Room Name",
      "players": 3,
      "maxPlayers": 10,
      "isPrivate": false,
      "host": { "id": "...", "username": "..." }
    }
  ]
}
```

#### POST /rooms
```json
// Request
{
  "name": "My Room",
  "maxPlayers": 10,
  "isPrivate": false,
  "password": "optional"
}

// Response 201
{ "id": "uuid", "joinCode": "ABC123" }
```

#### POST /rooms/:id/join
```json
// Request
{ "password": "if_private" }

// Response 200
{ "wsToken": "websocket_auth_token" }
```

---

### User

#### GET /users/:id
Public profile.

#### GET /users/:id/scenes
User's public scenes.

#### PUT /users/me
Update profile.

#### PUT /users/me/settings
Update preferences.

---

## WebSocket Events

### Connection
```
ws://api.particula.app/ws?token=<wsToken>&roomId=<roomId>
```

### Client → Server

| Event | Payload |
|-------|---------|
| `draw` | `{ particles: [{x, y, element}], brushSize }` |
| `erase` | `{ x, y, radius }` |
| `chat` | `{ message: string }` |
| `settings` | `{ gravity?, temp? }` |

### Server → Client

| Event | Payload |
|-------|---------|
| `sync` | `{ particles: [...], timestamp }` |
| `player_draw` | `{ playerId, particles }` |
| `player_join` | `{ player: {...} }` |
| `player_leave` | `{ playerId }` |
| `chat` | `{ playerId, message, timestamp }` |
| `error` | `{ code, message }` |

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_REQUIRED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | No permission |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION` | 400 | Invalid input |
| `RATE_LIMIT` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal error |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Auth | 10/min |
| Scenes CRUD | 30/min |
| Gallery | 60/min |
| WebSocket messages | 100/sec |
