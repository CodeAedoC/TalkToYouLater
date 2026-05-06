# TalkToYouLater

A simple WebSocket-based chat application backend built with Go and MongoDB. 

## Features
- Real-time messaging using WebSockets (`/ws`)
- Chat history retrieval (`/fetchHistory`)
- Chat creation and listing (`/createChat`, `/fetchChats`)
- File uploads and downloads using MongoDB GridFS (`/upload`, `/download/{id}`)

## Prerequisites
- Go
- MongoDB instance

## Setup

1. Create a `.env` file in the root directory and add your MongoDB connection string:
   ```
   MONGO_URI=your_mongodb_connection_string
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
