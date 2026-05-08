package main

import (
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func NewHub(rdb *redis.Client) *Hub{
	return &Hub{
		ActiveClientList: make(map[bson.ObjectID]map[*Client]bool),
		RedisClient: rdb,
		Join: make(chan *Client),
		Leave: make(chan *Client),
		Broadcast: make(chan Message),
	}
}