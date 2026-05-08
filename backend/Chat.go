package main

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Chat struct{
	ID bson.ObjectID `bson:"_id,omitempty" json:"id"`
	Participants []bson.ObjectID `bson:"participants" json:"participants"`
	LastMessage *Message `bson:"lastMessage,omitempty" json:"lastMessage"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}