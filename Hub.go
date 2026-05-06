package main

import (
	"log"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Hub struct {
	ActiveClientList map[bson.ObjectID]map[*Client]bool
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
			log.Println("The message has reached the hub")
			if clients, ok := h.ActiveClientList[message.ReceiverID]; ok {
				log.Println("Found user sending message")
				for client := range clients {
					client.Send <- message
				}
			}
		}
	}
}
