#!/bin/bash
# dev-with-dependencies.sh

# First build all shared packages
echo "Building shared packages..."
(cd packages/utils && bun run build) &
(cd packages/sdk && bun run build) &
(cd packages/agents && bun run build) &
wait

# Now start the service you're working on plus watchers for dependencies
echo "Starting service and dependency watchers..."
(cd packages/utils && bun run dev) &
(cd packages/sdk && bun run dev) &
(cd packages/agents && bun run dev) &
(cd packages/$1 && bun run dev)