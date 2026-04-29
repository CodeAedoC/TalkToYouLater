package main

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Message struct{
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`
	ChatID bson.ObjectID `bson:"chatId" json:"chatId"`
	SenderID bson.ObjectID `bson:"senderId" json:"senderId"`
	ReceiverID bson.ObjectID `bson:"receiverId" json:"receiverId"`
	Data string `bson:"data" json:"data"`
	SentTime time.Time `bson:"sentTime" json:"sentTime"`
	ReceivedTime time.Time `bson:"receivedTime" json:"receivedTime"`
	ReadTime time.Time `bson:"readTime" json:"readTime"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
	Status string `bson:"status" json:"status"`
	Type string `bson:"type" json:"type"`
}