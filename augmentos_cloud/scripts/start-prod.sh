#!/bin/bash
ENV=production
BASE_PORT=10000
export ENV BASE_PORT

# Start all services in production mode
docker-compose up -d