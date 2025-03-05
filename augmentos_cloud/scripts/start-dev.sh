#!/bin/bash
ENV=development
BASE_PORT=8000
export ENV BASE_PORT

# Start all services in development mode
docker-compose -f docker-compose.dev.yml up -d