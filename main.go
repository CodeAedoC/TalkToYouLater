package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

var bucket *mongo.GridFSBucket

func main(){
	_ = godotenv.Load()
	serverAPI := options.ServerAPI(options.ServerAPIVersion1)
	opts := options.Client().ApplyURI(os.Getenv("MONGO_URI")).SetServerAPIOptions(serverAPI)
	conn, err := mongo.Connect(opts)
	if err != nil{
		panic("Could not connect to Database");
	}
	bucket = conn.Database("TTYL").GridFSBucket()
	MessageCollection := conn.Database("TTYL").Collection("Messages")
	ChatCollection := conn.Database("TTYL").Collection("Chats")
	
	redisAddr := os.Getenv("REDIS_ADDR")
	rdb := redis.NewClient(&redis.Options{
		Addr:redisAddr,
	})
	hub := NewHub(rdb);
	
	server := Server{
		Hub: hub,
		MessageCollection: MessageCollection,
		ChatCollection: ChatCollection,
	}

	go hub.ListenToRedis();
	go hub.Run();
	http.HandleFunc("/ws", server.ClientHandler)
	http.HandleFunc("/fetchHistory", server.FetchHistory)
	http.HandleFunc("/fetchChats", server.FetchChats)
	http.HandleFunc("/createChat", server.CreateChat)
	http.HandleFunc("/upload", server.UploadHandler)
	http.HandleFunc("/download/{id}", server.DownloadHandler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}