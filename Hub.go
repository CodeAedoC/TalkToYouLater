package main

import (
	"log"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Hub struct {
	ActiveClientList map[bson.ObjectID]Client
	Join chan Client
	Leave chan Client
	Broadcast chan Message
}

func (h *Hub) Run(){
	for{
		select{
			case client := <-h.Join:
				h.ActiveClientList[client.ID] = client
				log.Println("Client Joined")
			case client := <-h.Leave:
				delete(h.ActiveClientList, client.ID)
				log.Println("Client Left")
			case message := <-h.Broadcast:
				log.Println("The message has reached the hub")
				if client, ok := h.ActiveClientList[message.ReceiverID]; ok{
					log.Println("Found user sending message")
					client.Send <- message
				}
		}
	}
}