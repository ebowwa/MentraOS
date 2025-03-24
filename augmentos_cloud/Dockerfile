# Stage 1: Build
FROM node:18-slim AS builder

# Install required tools
RUN apt-get update && apt-get install -y curl unzip git python3 make g++ tini && \
    curl -fsSL https://bun.sh/install | bash && \
    npm install -g typescript tsx ws

ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /app

# Copy your application code
COPY . .

# Install dependencies and build shared packages and services
RUN bun install && \
    cd packages/utils && bun run build && \
    cd ../sdk && bun run build && \
    cd ../agents && bun run build && \
    cd ../cloud && bun run build && \
    cd ../apps/livecaptions && bun run build && \
    cd ../dashboard-manager && bun run build && \
    cd ../notify && bun run build && \
    cd ../miraai && bun run build && \
    cd ../livetranslation && bun run build

# Stage 2: Production Image
FROM node:18-slim
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production

# Use tini as the init process
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default command (can be overridden by Porter)
CMD ["echo", "Ready to run services"]
