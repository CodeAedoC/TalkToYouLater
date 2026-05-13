package main

import(
	"go.mongodb.org/mongo-driver/v2/bson"
)


type User struct {
		ID bson.ObjectID `bson:"_id, omitempty" json:"id"`
		MobileNumber string `bson:"mobileNumber" json:"mobileNumber"`
		Name string `bson:"name" json:"name"`
}