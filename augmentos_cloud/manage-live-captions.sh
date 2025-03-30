#!/bin/bash

# Helper script to manage Live-Captions app

# Function to display usage
show_usage() {
  echo "Usage: ./manage-live-captions.sh <command>"
  echo ""
  echo "Commands:"
  echo "  dev           - Start Live-Captions in development mode (in foreground)"
  echo "  dev-detached  - Start Live-Captions in development mode (in background)"
  echo "  dev-build     - Rebuild and start Live-Captions in development mode"
  echo "  with-cloud    - Start both cloud and Live-Captions services"
  echo "  prod          - Start Live-Captions in production mode"
  echo "  prod-build    - Rebuild and start Live-Captions in production mode"
  echo "  logs          - View Live-Captions logs"
  echo "  stop          - Stop Live-Captions containers"
  echo "  status        - Check status of Live-Captions containers"
  echo "  help          - Show this help message"
}

# Check for network existence
ensure_networks() {
  # Dev network
  if ! docker network inspect augmentos-network-dev >/dev/null 2>&1; then
    echo "Creating augmentos-network-dev..."
    docker network create augmentos-network-dev
  fi
  
  # Prod network
  if ! docker network inspect augmentos-network >/dev/null 2>&1; then
    echo "Creating augmentos-network..."
    docker network create augmentos-network
  fi
}

# Process command
case "$1" in
  dev)
    ensure_networks
    echo "Starting Live-Captions in development mode..."
    docker-compose -f docker-compose.dev.yml -p dev up live-captions
    ;;
  dev-detached)
    ensure_networks
    echo "Starting Live-Captions in development mode (detached)..."
    docker-compose -f docker-compose.dev.yml -p dev up -d live-captions
    ;;
  dev-build)
    ensure_networks
    echo "Rebuilding and starting Live-Captions in development mode..."
    docker-compose -f docker-compose.dev.yml -p dev up -d --build live-captions
    ;;
  with-cloud)
    ensure_networks
    echo "Starting Cloud and Live-Captions services..."
    docker-compose -f docker-compose.dev.yml -p dev up shared-packages cloud live-captions
    ;;
  prod)
    ensure_networks
    echo "Starting Live-Captions in production mode..."
    docker-compose -f docker-compose.yml -p prod up -d live-captions
    ;;
  prod-build)
    ensure_networks
    echo "Rebuilding and starting Live-Captions in production mode..."
    docker-compose -f docker-compose.yml -p prod up -d --build live-captions
    ;;
  logs)
    echo "Showing Live-Captions logs..."
    docker-compose -f docker-compose.dev.yml -p dev logs -f live-captions
    ;;
  stop)
    echo "Stopping Live-Captions containers..."
    docker stop live-captions || echo "No running container named 'live-captions'"
    ;;
  status)
    echo "Live-Captions container status:"
    docker ps -a | grep live-captions
    ;;
  help|*)
    show_usage
    ;;
esac