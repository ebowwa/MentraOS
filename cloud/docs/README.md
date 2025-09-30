# MentraOS Cloud Documentation

This directory contains the documentation for MentraOS Cloud, built with Mintlify.

## Overview

MentraOS Cloud is the backend infrastructure that connects smart glasses to third-party applications through WebSocket connections and REST APIs.

## Local Development

Install Mintlify CLI:

```bash
bun install -g mintlify
```

Run the docs locally:

```bash
mint dev
```

View your local preview at `http://localhost:3000`.

## Documentation Structure

- **Architecture**: Core concepts and system design (`1-*.md` files)
- **API Reference**: WebSocket and REST endpoint documentation
- **SDK Reference**: MentraOS SDK usage and examples

## Key Topics

- WebSocket connections for real-time communication
- User sessions and manager pattern
- Message types between glasses, cloud, and apps
- Authentication flow
- SDK integration

## Resources

- [MentraOS GitHub](https://github.com/Mentra-Community/MentraOS)
- [Discord Community](https://discord.gg/5ukNvkEAqT)
- [SDK Package](https://www.npmjs.com/package/@mentraos/sdk)
