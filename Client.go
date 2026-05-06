package main

import (
	"context"
	"log"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type Client struct{
	ID bson.ObjectID
	Conn *websocket.Conn
	ActiveChatID bson.ObjectID
	Send chan Message
	Hub *Hub
	MessageCollection *mongo.Collection
	ChatCollection *mongo.Collection
}

func (c *Client) ReadPump(){
	for{
		if message, ok := <-c.Send; ok{
			err := c.Conn.WriteJSON(message)
			if err != nil{
				if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseAbnormalClosure){
					c.Hub.Leave <- *c
				}
				log.Println("Error while sending the message")
				return
			}
			if message.Type == "CHAT"{
				message.Status = "delivered"
				if c.ActiveChatID == message.ChatID{message.Status = "read"}
				message.ReceivedTime = time.Now()
				message.UpdatedAt = time.Now()
				go c.updateMessage(message);
				updateStatus := Message{
					ID: message.ID,
					ChatID: message.ChatID,
					SenderID: message.ReceiverID,
					ReceiverID: message.SenderID,
					Status: message.Status,
					Type: "UPDATE_STATUS",
				}
				c.Hub.Broadcast <- updateStatus
			}
		}else{
			return
		}
	}
}

func (c *Client) WritePump(){
	defer func(){
		c.Hub.Leave <- *c
		c.Conn.Close()
	}()
	
	for{
		var message Message
		err := c.Conn.ReadJSON(&message)
		if err != nil{
			log.Println("Error while getting the message")
			return
		}
		
		message.ID = bson.NewObjectID();
		message.ChatID = c.ActiveChatID;
		message.Status = "sent"
		message.SentTime = time.Now()
		message.UpdatedAt = time.Now()
		go c.saveMessage(message)
		c.Hub.Broadcast <- message
	}
}

func (c *Client) saveMessage(message Message){
	_, err := c.MessageCollection.InsertOne(context.TODO(), message)
	if err != nil{
		log.Println("Could not write to Database")
		return
	}
	if message.Type == "CHAT"{
		filterChat := bson.M{"_id":message.ChatID}
		updateChat := bson.M{
			"$set": bson.M{
				"lastMessage": &message,
				"updatedAt": time.Now(),
			},
		}
		_, err := c.ChatCollection.UpdateOne(context.TODO(), filterChat, updateChat)
		if err != nil{
			log.Println("Could not write to Database", err)
			return
		}
	}
}

func (c *Client) updateMessage(message Message){
	filter := bson.M{"_id": message.ID}
	updates := bson.M{
		"$set": bson.M{
			"status": message.Status,
			"receivedTime": message.ReceivedTime,
			"updatedAt": message.UpdatedAt,
		},
	}
	
	_, err := c.MessageCollection.UpdateOne(context.TODO(), filter, updates)
	if err != nil{
		log.Println("Could not Update Message in Database", err)
		return
	}
	
	if message.Type == "CHAT"{
		filterChat := bson.M{"_id":message.ChatID}
		updateChat := bson.M{
			"$set": bson.M{
				"lastMessage": &message,
				"updatedAt": time.Now(),
			},
		}
		_, err := c.ChatCollection.UpdateOne(context.TODO(), filterChat, updateChat)
		if err != nil{
			log.Println("Could not Update Chat in Database", err)
			return
		}
	}
}