package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var bucket *mongo.GridFSBucket

func main(){
	err := godotenv.Load()
	if err != nil{
		panic("Env variables couldnt be accessed")
	}
	serverAPI := options.ServerAPI(options.ServerAPIVersion1)
	opts := options.Client().ApplyURI(os.Getenv("MONGO_URI")).SetServerAPIOptions(serverAPI)
	conn, err := mongo.Connect(opts)
	bucket = conn.Database("TTYL").GridFSBucket()
	MessageCollection := conn.Database("TTYL").Collection("Messages")
	ChatCollection := conn.Database("TTYL").Collection("Chats")
	
	hub := NewHub();
	server := Server{
		Hub: hub,
		MessageCollection: MessageCollection,
		ChatCollection: ChatCollection,
	}
	
	go hub.Run();
	http.HandleFunc("/ws", server.ClientHandler)
	http.HandleFunc("/fetchHistory", server.FetchHistory)
	http.HandleFunc("/fetchChats", server.FetchChats)
	http.HandleFunc("/createChat", server.CreateChat)
	http.HandleFunc("/upload", server.UploadHandler)
	http.HandleFunc("/download/{id}", server.DownloadHandler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}