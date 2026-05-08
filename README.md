# TalkToYouLater

A simple WebSocket-based chat application backend built with Go, MongoDB, and Redis for scalability.

## Features
- Real-time messaging using WebSockets (`/ws`)
- Scalability with Redis Pub/Sub for horizontal scaling
- Chat history retrieval (`/fetchHistory`)
- Chat creation and listing (`/createChat`, `/fetchChats`)
- File uploads and downloads using MongoDB GridFS (`/upload`, `/download/{id}`)
- Dockerized setup using `docker-compose`

## Prerequisites
- Go (for local development)
- MongoDB instance
- Redis instance
- Docker & Docker Compose (optional, for containerized setup)

## Setup

### Using Docker Compose (Recommended)

1. Create a `.env` file in the root directory:
   ```env
   MONGO_URI=mongodb://mongodb:27017
   REDIS_ADDR=redis:6379
   ```

2. Run docker-compose:
   ```bash
   docker-compose up --build
   ```

### Local Setup

1. Create a `.env` file in the root directory:
   ```env
   MONGO_URI=your_mongodb_connection_string
   REDIS_ADDR=localhost:6379
   ```

2. Install the necessary dependencies:
   ```bash
   go mod tidy
   ```

3. Run the application:
   ```bash
   go run .
   ```

The server will start and listen on port `8080` by default.
