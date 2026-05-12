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

func enableCORS(next http.Handler) http.Handler{
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request){
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS"{
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r);
	})
}

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
	mux := http.NewServeMux();
	mux.HandleFunc("/ws", server.ClientHandler)
	mux.HandleFunc("/fetchHistory", server.FetchHistory)
	mux.HandleFunc("/fetchChats", server.FetchChats)
	mux.HandleFunc("/createChat", server.CreateChat)
	mux.HandleFunc("/upload", server.UploadHandler)
	mux.HandleFunc("/download/{id}", server.DownloadHandler)
	log.Fatal(http.ListenAndServe(":8080", enableCORS(mux)))
}