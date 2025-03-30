# Improved Docker Setup for AugmentOS Cloud

This guide explains the improved Docker configuration to run MentraMerge and Live-Captions with AugmentOS Cloud without using container images.

## Key Improvements

1. **Local files instead of images**: Both docker-compose.yml and docker-compose.dev.yml now use the local file system instead of pre-built images
2. **Simplified service startup**: New helper scripts allow starting only the services you need
3. **Reduced restart issues**: Services are isolated so they don't restart each other unnecessarily
4. **Correct paths**: All volume paths are now relative to the repository structure
5. **Consistent container naming**: Container names are standardized for reliable networking

## Directory Structure

The expected directory structure is:

```
BallahTech/
├── AugmentOS/
│   └── augmentos_cloud/     # This repository
├── AugmentApps/
│   ├── Live-Captions/       # The Live-Captions repository
│   └── MentraMerge/         # The MentraMerge repository
```

## Usage Options

### Option 1: Using Helper Scripts

Helper scripts provide a simple way to manage services:

```bash
# For MentraMerge
./manage-merge.sh dev           # Start just MentraMerge in dev mode
./manage-merge.sh with-cloud    # Start Cloud + MentraMerge together
./manage-merge.sh dev-build     # Rebuild and start MentraMerge
./manage-merge.sh logs          # View MentraMerge logs
./manage-merge.sh stop          # Stop MentraMerge

# For Live-Captions
./manage-live-captions.sh dev           # Start just Live-Captions in dev mode
./manage-live-captions.sh with-cloud    # Start Cloud + Live-Captions together
./manage-live-captions.sh logs          # View Live-Captions logs
```

### Option 2: Using NPM Scripts

Package.json includes scripts for common operations:

```bash
# Core services
bun run dev:core              # Start just shared-packages + cloud

# MentraMerge
bun run merge:dev             # Start just MentraMerge
bun run merge:dev:build       # Rebuild and start MentraMerge
bun run logs:merge            # View MentraMerge logs

# Live-Captions
bun run live-captions:dev     # Start just Live-Captions
bun run logs:live-captions    # View Live-Captions logs

# Full stack
bun run dev                   # Start all services
```

### Option 3: Using Docker Compose Directly

For more control, you can use docker-compose commands directly:

```bash
# Start specific services
docker-compose -f docker-compose.dev.yml -p dev up shared-packages cloud merge

# Rebuild specific services
docker-compose -f docker-compose.dev.yml -p dev up -d --build merge

# View logs
docker-compose -f docker-compose.dev.yml -p dev logs -f merge
```

## Troubleshooting

1. If you encounter network errors, ensure the Docker networks exist:
   ```bash
   docker network create augmentos-network-dev
   docker network create augmentos-network
   ```

2. If a service isn't finding another service by hostname, verify:
   - Both services are on the same network (check docker-compose.yml)
   - The container names match the hostnames being used
   - The services are running (`docker ps`)

3. For permission issues with mounted volumes, verify:
   - File permissions (especially for shell scripts)
   - Ownership of the mounted directories

4. To clean up everything and start fresh:
   ```bash
   bun run dev:clean
   ```