package main

import "go.mongodb.org/mongo-driver/v2/bson"

func NewHub() *Hub{
	return &Hub{
		ActiveClientList: make(map[bson.ObjectID]Client),
		Join: make(chan Client),
		Leave: make(chan Client),
		Broadcast: make(chan Message),
	}
}