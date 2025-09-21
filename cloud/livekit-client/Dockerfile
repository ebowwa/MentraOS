# Build stage
FROM golang:1.24-alpine AS builder

# Install build dependencies including C compiler for CGO
RUN apk add --no-cache git gcc musl-dev pkgconfig opus-dev opusfile-dev soxr-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary with CGO enabled for opus codec
RUN CGO_ENABLED=1 GOOS=linux go build -o livekit-bridge .

# Runtime stage
FROM alpine:latest

# Install runtime dependencies for opus and ca-certificates
RUN apk --no-cache add ca-certificates libc6-compat opus opusfile soxr

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/livekit-bridge .

# Expose WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run the binary
CMD ["./livekit-bridge"]