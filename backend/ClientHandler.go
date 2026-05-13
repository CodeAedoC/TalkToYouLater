package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Server struct {
	Hub               *Hub
	MessageCollection *mongo.Collection
	ChatCollection    *mongo.Collection
	UserCollection    *mongo.Collection
}

type ChatResponse struct {
		ID                bson.ObjectID   `json:"id"`
		Participants      []bson.ObjectID `json:"participants"`
		OtherParticipants []User          `json:"otherParticipants"`
		LastMessage       *Message        `json:"lastMessage"`
		UpdatedAt         time.Time       `json:"updatedAt"`
}

func (s *Server) ClientHandler(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Could not establish connection")
		return
	}
	clientIDStr := r.URL.Query().Get("userID")
	clientID, err := bson.ObjectIDFromHex(clientIDStr)
	if err != nil {
		log.Println("Wrong User ID Format")
		return
	}
	chatIDStr := r.URL.Query().Get("chatID")
	chatID, err := bson.ObjectIDFromHex(chatIDStr)
	if err != nil {
		log.Println("Wrong User ID Format")
		return
	}

	client := &Client{
		ID:                clientID,
		Conn:              conn,
		ActiveChatID:      chatID,
		Send:              make(chan Message),
		Hub:               s.Hub,
		MessageCollection: s.MessageCollection,
		ChatCollection:    s.ChatCollection,
	}

	s.Hub.Join <- client
	go client.ReadPump()
	go client.WritePump()
}

func (s *Server) FetchHistory(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("userID")
	userID, err := bson.ObjectIDFromHex(userIDStr)
	if err != nil {
		http.Error(w, "Wrong ID Format", http.StatusBadRequest)
		return
	}
	chatIDStr := r.URL.Query().Get("chatID")
	chatID, err := bson.ObjectIDFromHex(chatIDStr)
	if err != nil {
		http.Error(w, "Wrong ID Format", http.StatusBadRequest)
		return
	}
	limit, err := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	if err != nil {
		http.Error(w, "Please provide a number as the limit", http.StatusBadRequest)
		return
	}
	if limit < 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	filter := bson.M{"chatId": chatID}
	before := r.URL.Query().Get("before")
	if before != "" {
		lastTime, err := time.Parse(time.RFC3339, before)
		if err != nil {
			http.Error(w, "Wrong Time Format", http.StatusBadRequest)
		}
		filter["updatedAt"] = bson.M{"$lt": lastTime}
	}
	opts := options.Find().SetLimit(limit).SetSort(bson.D{{Key: "updatedAt", Value: -1}})
	cursor, err := s.MessageCollection.Find(context.TODO(), filter, opts)
	if err != nil {
		log.Print("Could not fetch chat history", err)
		return
	}

	var messages []Message = []Message{}
	err = cursor.All(context.TODO(), &messages)
	if err != nil {
		http.Error(w, "Could not retrieve messages", http.StatusInternalServerError)
		return
	}

	if len(messages) > 0 {
		message := messages[0]
		if message.ReceiverID == userID && message.Status != "read" {
			updateStatus := Message{
				ID:         message.ID,
				ChatID:     message.ChatID,
				SenderID:   message.ReceiverID,
				ReceiverID: message.SenderID,
				Status:     "read",
				Type:       "UPDATE_STATUS",
			}
			s.Hub.Broadcast <- updateStatus
			for i, _ := range messages {
				messages[i].Status = "read"
				messages[i].ReadTime = time.Now()
			}
		}
	}

	if before == "" {
		filter = bson.M{
			"chatId":     chatID,
			"receiverId": bson.M{"$eq": userID},
			"status":     bson.M{"$ne": "read"},
			"updatedAt":  bson.M{"$lt": time.Now()},
		}
		update := bson.M{
			"$set": bson.M{
				"status":    "read",
				"readTime":  time.Now(),
				"updatedAt": time.Now(),
			},
		}
		_, err = s.MessageCollection.UpdateMany(context.TODO(), filter, update)
		if err != nil {
			log.Println("Could not update all messages to Read")
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&messages)
}

func (s *Server) FetchChats(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("userID")
	userID, err := bson.ObjectIDFromHex(userIDStr)
	limit, _ := strconv.ParseInt(r.URL.Query().Get("limit"), 10, 64)
	if limit <= 0 {
		limit = int64(20)
	}
	if limit > 100 {
		limit = int64(100)
	}

	if err != nil {
		log.Println("Wrong User ID Format")
		return
	}
	filter := bson.D{{Key: "participants", Value: userID}}
	beforeStr := r.URL.Query().Get("before")
	if beforeStr != "" {
		lastTime, err := time.Parse(time.RFC3339, beforeStr)
		if err != nil {
			http.Error(w, "Wrong time Format", http.StatusBadRequest)
			return
		}
		filter = bson.D{
			{Key: "participants", Value: userID},
			{Key: "updatedAt", Value: bson.M{"$lt": lastTime}},
		}
	}

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$sort", Value: bson.D{{Key: "updatedAt", Value: -1}}}},
		{{Key: "$limit", Value: limit}},

		{{Key: "$lookup", Value: bson.D{
			{Key: "from", Value: "Users"},
			{Key: "localField", Value: "participants"},
			{Key: "foreignField", Value: "_id"},
			{Key: "as", Value: "otherParticipants"},
		}}},

		{{Key: "$set", Value: bson.D{
			{Key: "otherParticipants", Value: bson.D{
				{Key: "$filter", Value: bson.D{
					{Key: "input", Value: "$otherParticipants"},
					{Key: "as", Value: "p"},
					{Key: "cond", Value: bson.D{
						{Key: "$ne", Value: bson.A{"$$p._id", userID}},
					}},
				}},
			}},
		}}},
	}

	cursor, err := s.ChatCollection.Aggregate(context.TODO(), pipeline)
	if err != nil {
		log.Println("Could not fetch chats")
		return
	}
	defer cursor.Close(context.TODO())

	var chats []ChatResponse = []ChatResponse{}
	if err := cursor.All(context.TODO(), &chats); err != nil {
		http.Error(w, "Error decoding chats", http.StatusInternalServerError)
		return
	}

	filter = bson.D{
		{Key: "receiverId", Value: bson.M{"$eq": userID}},
		{Key: "status", Value: bson.M{"$eq": "sent"}},
	}
	var message Message
	messageVal := s.MessageCollection.FindOne(context.TODO(), filter)
	err = messageVal.Decode(&message)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			log.Println("No such message found")
		} else {
			log.Println("Could not decode message")
			return
		}
	}

	if message.ReceiverID == userID && message.Status == "sent" {
		updateStatus := Message{
			ID:         message.ID,
			ChatID:     message.ChatID,
			SenderID:   message.ReceiverID,
			ReceiverID: message.SenderID,
			Status:     "delivered",
			Type:       "UPDATE_STATUS",
		}
		s.Hub.Broadcast <- updateStatus
	}

	filter = bson.D{
		{Key: "receiverId", Value: bson.M{"$eq": userID}},
		{Key: "status", Value: bson.M{"$eq": "sent"}},
		{Key: "updatedAt", Value: bson.M{"$lte": message.UpdatedAt}},
	}
	update := bson.M{
		"$set": bson.M{
			"status":       "delivered",
			"receivedTime": time.Now(),
			"updatedAt":    time.Now(),
		},
	}

	_, err = s.MessageCollection.UpdateMany(context.TODO(), filter, update)
	if err != nil {
		log.Println("Could not update all messages to Delivered")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(&chats)
	if err != nil {
		http.Error(w, "Could not Encode Response", http.StatusInternalServerError)
		return
	}
}

func (s *Server) CreateChat(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("id")
	userID, err := bson.ObjectIDFromHex(userIDStr)
	if err != nil {
		http.Error(w, "Wrong ID Format", http.StatusBadRequest)
		log.Print("Wrong ID Format")
		return
	}
	mobileNumber := r.URL.Query().Get("mobileNumber")
	otherUserResult := s.UserCollection.FindOne(context.TODO(), bson.M{"mobileNumber": mobileNumber})
	if otherUserResult.Err() == mongo.ErrNoDocuments {
		http.Error(w, "No such User Found", http.StatusBadRequest)
		return
	}
	var otherUser User
	err = otherUserResult.Decode(&otherUser)
	if err != nil {
		http.Error(w, "Could not decode result", http.StatusInternalServerError)
		log.Print("Could not decode result")
		return
	}

	var participants []bson.ObjectID;
	participants = append(participants, userID)
	participants = append(participants, otherUser.ID)
	otherParticipant := []User{otherUser}

	chatResult := s.ChatCollection.FindOne(context.TODO(), bson.M{"participants": participants})
	if chatResult.Err() == nil{
		http.Error(w, "Chat already exists", http.StatusBadRequest)
		return
	}
	
	newChat := ChatResponse{
		ID:           bson.NewObjectID(),
		Participants: participants,
		OtherParticipants: otherParticipant,
		UpdatedAt:    time.Now(),
	}

	_, err = s.ChatCollection.InsertOne(context.TODO(), newChat)
	if err != nil {
		http.Error(w, "Could not create new chat", http.StatusInternalServerError)
		return
	}

	newChatUpdate := Message{
		ID:         newChat.ID,
		ChatID:     newChat.ID,
		SenderID:   userID,
		ReceiverID: otherUser.ID,
		Type:       "NEW_CHAT",
	}

	s.Hub.Broadcast <- newChatUpdate

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&newChat)
}

func (s *Server) UploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Use POST Method", http.StatusMethodNotAllowed)
		return
	}

	var MAX_UPLOAD_SIZE int64 = 10 * 1024 * 1024 //10MB
	r.Body = http.MaxBytesReader(w, r.Body, MAX_UPLOAD_SIZE)

	err := r.ParseMultipartForm(32 * 1024 * 1024) //32MB
	if err != nil {
		http.Error(w, "File too large or invalid request", http.StatusRequestEntityTooLarge)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Upload Failed", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > MAX_UPLOAD_SIZE {
		http.Error(w, "File is larger than 10MB", http.StatusBadRequest)
		return
	}

	fileID, err := bucket.UploadFromStream(context.TODO(), header.Filename, file)
	if err != nil {
		http.Error(w, "Could save file to DB", http.StatusInternalServerError)
		return
	}

	newMediaInfo := MediaInfo{
		FileName: header.Filename,
		FileSize: header.Size,
		URL:      "/download/" + fileID.Hex(),
		FileID:   fileID.Hex(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&newMediaInfo)
}

func (s *Server) DownloadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Use GET Method", http.StatusMethodNotAllowed)
		return
	}

	fileIDStr := r.PathValue("id")
	fileID, err := bson.ObjectIDFromHex(fileIDStr)
	if err != nil {
		http.Error(w, "Wrong File ID", http.StatusBadRequest)
		return
	}

	_, err = bucket.DownloadToStream(context.TODO(), fileID, w)
	if err != nil {
		http.Error(w, "File not Found", http.StatusInternalServerError)
		return
	}
}

func (s *Server) SignUpHandler(w http.ResponseWriter, r *http.Request) {
	MobileNumber := r.URL.Query().Get("mobileNumber")
	Name := r.URL.Query().Get("name")
	filter := bson.M{"mobileNumber": MobileNumber}
	result := s.UserCollection.FindOne(context.TODO(), filter)
	if result.Err() == mongo.ErrNoDocuments {
		user := User{
			ID:           bson.NewObjectID(),
			MobileNumber: MobileNumber,
			Name:         Name,
		}
		if _, err := s.UserCollection.InsertOne(context.TODO(), user); err != nil {
			http.Error(w, "Could not signup, Try Later...", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&user)
	} else {
		http.Error(w, "User already exists login please", http.StatusBadRequest)
		return
	}
}

func (s *Server) LoginHandler(w http.ResponseWriter, r *http.Request) {
	MobileNumber := r.URL.Query().Get("mobileNumber")
	filter := bson.M{"mobileNumber": MobileNumber}
	result := s.UserCollection.FindOne(context.TODO(), filter)
	if result.Err() == mongo.ErrNoDocuments {
		http.Error(w, "User does not exist", http.StatusBadRequest)
		return
	} else {
		var user User
		if err := result.Decode(&user); err != nil {
			http.Error(w, "Could not decode user", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&user)
	}
}
