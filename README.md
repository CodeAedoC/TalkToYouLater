# MujhseBaatKarogiNaa (TTYL)

A full-stack, real-time chat application built with a **Go** backend and a **React** frontend, powered by **MongoDB**, **Redis**, and **WebSockets**.

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Backend   | Go (stdlib `net/http`)                  |
| Frontend  | React 19, Vite 8                        |
| Database  | MongoDB (messages, chats, users, files) |
| File Store| MongoDB GridFS                          |
| Pub/Sub   | Redis (horizontal scaling)              |
| Realtime  | WebSockets (`gorilla/websocket`)        |
| Container | Docker & Docker Compose                 |

---

## Features

- **Authentication** — signup and login by mobile number (no passwords)
- **Real-time messaging** via WebSockets
- **Message status tracking** — `sent` → `delivered` → `read` with double-tick indicators
- **Paginated chat list** — sorted by most recent activity, load-more support
- **Paginated message history** — oldest-first with infinite scroll upwards
- **File attachments** — images, videos, and arbitrary files up to 10 MB
- **Media previews** — inline image/video rendering in the chat window
- **New chat notifications** — participants are notified in real-time when a new chat is created
- **Horizontal scalability** via Redis Pub/Sub; multiple backend instances share message state
- **Dockerized** — single `docker-compose up` to run the full stack

---

## Project Structure

```
MujhseBaatKarogiNaa/
├── backend/
│   ├── main.go             # Entry point: DB/Redis setup, route registration
│   ├── ClientHandler.go    # All HTTP & WS handler functions
│   ├── Client.go           # Per-connection WebSocket read/write pumps
│   ├── Hub.go              # In-memory connection registry + Redis listener
│   ├── NewHub.go           # Hub constructor
│   ├── Chat.go             # Chat data model
│   ├── Message.go          # Message & MediaInfo data models
│   ├── User.go             # User data model
│   ├── Dockerfile          # Multi-stage Go Docker image
│   └── .env                # Backend environment variables
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Full React application (single-file SPA)
│   │   └── index.css       # Global styles (cyberpunk dark theme)
│   ├── index.html
│   ├── vite.config.js
│   └── .env                # Frontend environment variables
└── docker-compose.yml      # Orchestrates backend, MongoDB, and Redis
```

---

## API Reference

All endpoints are served on port `8080`. CORS is configured to allow `http://localhost:5173`.

### Authentication

#### `GET /signup`
Register a new user.

| Query Param    | Type   | Description       |
|----------------|--------|-------------------|
| `mobileNumber` | string | User's phone number |
| `name`         | string | Display name      |

**Response:** `User` object (JSON)

---

#### `GET /login`
Log in an existing user.

| Query Param    | Type   | Description         |
|----------------|--------|---------------------|
| `mobileNumber` | string | Registered phone number |

**Response:** `User` object (JSON)

---

### Chats

#### `GET /fetchChats`
Fetch the authenticated user's chat list, sorted by most recent activity. Supports cursor-based pagination.

| Query Param | Type   | Description                                    |
|-------------|--------|------------------------------------------------|
| `userID`    | string | The logged-in user's MongoDB ObjectID          |
| `limit`     | number | Max chats to return (default 20, max 100)      |
| `before`    | string | RFC3339 timestamp — return chats updated before this time (for pagination) |

**Response:** Array of `ChatResponse` objects. Each includes `otherParticipants` with full user details (name, mobile number) for display.

> Also triggers a `delivered` status update for any unread messages sent to this user.

---

#### `GET /createChat`
Create a new one-on-one chat between the caller and another user. Broadcasts a `NEW_CHAT` WebSocket event to the other participant so their sidebar updates immediately.

| Query Param    | Type   | Description                        |
|----------------|--------|------------------------------------|
| `id`           | string | Creator's MongoDB ObjectID         |
| `mobileNumber` | string | Target user's phone number         |

**Response:** The newly created `ChatResponse` object (JSON). Returns `400` if a chat between these two users already exists.

---

### Messages

#### `GET /fetchHistory`
Fetch message history for a chat. Supports cursor-based pagination (load older messages). Automatically marks all unread messages in the chat as `read` and broadcasts status updates to the sender.

| Query Param | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `userID`    | string | The logged-in user's MongoDB ObjectID            |
| `chatID`    | string | The chat's MongoDB ObjectID                      |
| `limit`     | number | Max messages to return (default 20, max 100)     |
| `before`    | string | RFC3339 timestamp — return messages before this time |

**Response:** Array of `Message` objects, sorted newest-first (the frontend reverses them for display).

---

### Files

#### `POST /upload`
Upload a file attachment (max **10 MB**). Stores the file in MongoDB GridFS.

- **Content-Type:** `multipart/form-data`
- **Form field:** `file`

**Response:** `MediaInfo` object:
```json
{
  "fileName": "photo.jpg",
  "fileType": "",
  "fileSize": 204800,
  "url": "/download/<gridfs-object-id>",
  "fileId": "<gridfs-object-id>"
}
```

---

#### `GET /download/{id}`
Stream a file from GridFS by its ObjectID. Used by the frontend to display/download media.

| Path Param | Type   | Description             |
|------------|--------|-------------------------|
| `id`       | string | GridFS file ObjectID    |

---

### WebSocket

#### `GET /ws`
Upgrade to a WebSocket connection scoped to a specific chat.

| Query Param | Type   | Description                    |
|-------------|--------|--------------------------------|
| `userID`    | string | The connected user's ObjectID  |
| `chatID`    | string | The active chat's ObjectID     |

#### Inbound message (client → server)
```json
{
  "senderId":   "<objectid>",
  "receiverId": "<objectid>",
  "data":       "Hello!",
  "media":      null,
  "type":       "CHAT"
}
```

#### Outbound events (server → client)

| `type`          | Description                                      |
|-----------------|--------------------------------------------------|
| `CHAT`          | New incoming message from the other participant  |
| `UPDATE_STATUS` | Message status changed (`sent`/`delivered`/`read`) |
| `NEW_CHAT`      | A new chat was created involving this user       |

---

## Data Models

### User
```go
type User struct {
    ID           bson.ObjectID  // MongoDB _id
    MobileNumber string
    Name         string
}
```

### Message
```go
type Message struct {
    ID           bson.ObjectID
    ChatID       bson.ObjectID
    SenderID     bson.ObjectID
    ReceiverID   bson.ObjectID
    Data         string         // text content
    Media        *MediaInfo     // nil for text-only messages
    SentTime     time.Time
    ReceivedTime time.Time
    ReadTime     time.Time
    UpdatedAt    time.Time
    Status       string         // "sent" | "delivered" | "read"
    Type         string         // "CHAT" | "UPDATE_STATUS" | "NEW_CHAT"
}
```

### MediaInfo
```go
type MediaInfo struct {
    FileName string
    FileType string
    FileSize int64
    URL      string   // relative path: /download/<id>
    FileID   string
}
```

---

## Environment Variables

### Backend (`backend/.env`)
```env
MONGO_URI=mongodb://localhost:27017
REDIS_ADDR=localhost:6379
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

---

## Setup & Running

### Prerequisites
- **Docker & Docker Compose** (recommended)
- OR: **Go 1.21+**, **Node.js 18+**, a running **MongoDB** instance, and a running **Redis** instance

---

### Option 1 — Docker Compose (Recommended)

Runs the backend, MongoDB, and Redis together. You still need to run the frontend separately.

1. Ensure `backend/.env` exists (see above).

2. Start the backend stack:
   ```bash
   docker-compose up --build
   ```
   The backend will be available at `http://localhost:8080`.

3. In a separate terminal, start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend will be available at `http://localhost:5173`.

---

### Option 2 — Local Development

1. Start MongoDB and Redis locally.

2. Create `backend/.env`:
   ```env
   MONGO_URI=mongodb://localhost:27017
   REDIS_ADDR=localhost:6379
   ```

3. Run the backend:
   ```bash
   cd backend
   go mod tidy
   go run .
   ```

4. Create `frontend/.env` (already present in the repo):
   ```env
   VITE_API_URL=http://localhost:8080
   VITE_WS_URL=ws://localhost:8080
   ```

5. Run the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## MongoDB Collections

The application uses the `TTYL` database with the following collections:

| Collection | Contents                              |
|------------|---------------------------------------|
| `Users`    | User accounts (name, mobile number)   |
| `Chats`    | Chat metadata and participant lists   |
| `Messages` | All chat messages with status fields  |
| `fs.*`     | GridFS buckets for file storage       |

MongoDB data is persisted across restarts via a named Docker volume (`mongo_data`).
