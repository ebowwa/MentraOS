#!/bin/bash

# Helper script to manage MentraMerge app

# Function to display usage
show_usage() {
  echo "Usage: ./manage-merge.sh <command>"
  echo ""
  echo "Commands:"
  echo "  dev           - Start MentraMerge in development mode (in foreground)"
  echo "  dev-detached  - Start MentraMerge in development mode (in background)"
  echo "  dev-build     - Rebuild and start MentraMerge in development mode"
  echo "  with-cloud    - Start both cloud and MentraMerge services"
  echo "  full-stack    - Start all services including MentraMerge"
  echo "  prod          - Start MentraMerge in production mode"
  echo "  prod-build    - Rebuild and start MentraMerge in production mode"
  echo "  logs          - View MentraMerge logs"
  echo "  stop          - Stop MentraMerge containers"
  echo "  stop-all      - Stop all containers in the development environment"
  echo "  status        - Check status of MentraMerge containers"
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
    echo "Starting MentraMerge in development mode..."
    docker-compose -f docker-compose.dev.yml -p dev up merge
    ;;
  dev-detached)
    ensure_networks
    echo "Starting MentraMerge in development mode (detached)..."
    docker-compose -f docker-compose.dev.yml -p dev up -d merge
    ;;
  dev-build)
    ensure_networks
    echo "Rebuilding and starting MentraMerge in development mode..."
    docker-compose -f docker-compose.dev.yml -p dev up -d --build merge
    ;;
  with-cloud)
    ensure_networks
    echo "Starting Cloud and MentraMerge services..."
    docker-compose -f docker-compose.dev.yml -p dev up shared-packages cloud merge
    ;;
  full-stack)
    ensure_networks
    echo "Starting the full stack of services..."
    docker-compose -f docker-compose.dev.yml -p dev up
    ;;
  prod)
    ensure_networks
    echo "Starting MentraMerge in production mode..."
    docker-compose -f docker-compose.yml -p prod up -d merge
    ;;
  prod-build)
    ensure_networks
    echo "Rebuilding and starting MentraMerge in production mode..."
    docker-compose -f docker-compose.yml -p prod up -d --build merge
    ;;
  logs)
    echo "Showing MentraMerge logs..."
    docker-compose -f docker-compose.dev.yml -p dev logs -f merge
    ;;
  stop)
    echo "Stopping MentraMerge containers..."
    docker stop merge || echo "No running container named 'merge'"
    ;;
  stop-all)
    echo "Stopping all development containers..."
    docker-compose -f docker-compose.dev.yml -p dev down
    ;;
  status)
    echo "MentraMerge container status:"
    docker ps -a | grep merge
    ;;
  help|*)
    show_usage
    ;;
esac