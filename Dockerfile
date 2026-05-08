# Step 1: Use the official Golang image as the base
FROM golang:1.26-alpine

# Step 2: Set the working directory inside the container
WORKDIR /app

# Step 3: Copy go.mod and go.sum files to install dependencies
# Note: Ensure you have run 'go mod init' in your project folder first
COPY go.mod go.sum ./
RUN go mod download

# Step 4: Copy the rest of your source code
COPY . .

# Step 5: Build the Go application
RUN go build -o main .

# Step 6: Expose the port your server listens on
EXPOSE 8080

# Step 7: Run the binary
CMD ["./main"]