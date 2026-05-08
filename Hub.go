package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type Hub struct {
	ActiveClientList map[bson.ObjectID]map[*Client]bool
	RedisClient 	 *redis.Client
	Join             chan *Client
	Leave            chan *Client
	Broadcast        chan Message
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Join:
			if _, ok := h.ActiveClientList[client.ID]; !ok {
				h.ActiveClientList[client.ID] = make(map[*Client]bool)
			}
			h.ActiveClientList[client.ID][client] = true
			log.Println("Client Joined")
		case client := <-h.Leave:
			if _, ok := h.ActiveClientList[client.ID]; ok {
				delete(h.ActiveClientList[client.ID], client)
				if len(h.ActiveClientList[client.ID]) == 0 {
					delete(h.ActiveClientList, client.ID)
				}
			}
			log.Println("Client Left")
		case message := <-h.Broadcast:
			payload, _ := json.Marshal(message)
			h.RedisClient.Publish(context.TODO(), "chat_room", payload)
		}
	}
}

func (h *Hub) ListenToRedis(){
	pubsub := h.RedisClient.Subscribe(context.TODO(), "chat_room")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch{
		var message Message
		json.Unmarshal([]byte(msg.Payload), &message)

		if clients, ok := h.ActiveClientList[message.ReceiverID]; ok{
			for client := range clients{
				client.Send <- message
			}
		}
	}
}