# ASG Client Documentation

Welcome to the ASG Client documentation. This is the Android application that runs on Android-based smart glasses, providing the core functionality for MentraOS glasses integration.

## 📚 Documentation Structure

### Getting Started

- [Overview](overview.md) - Architecture and core concepts
- [Mentra Live Setup](mentra-live-setup.md) - Setup guide for Mentra Live glasses
- [Development Environment](development-setup.md) - Setting up your development environment

### Core Features

- [Button Press System](features/button-press-system.md) - How physical button presses work
- [RTMP Streaming](features/rtmp-streaming.md) - Live video streaming functionality
- [Camera Web Server](features/camera-webserver.md) - Remote photo capture and gallery
- [Custom Audio](features/custom-audio.md) - LC3 GATT audio implementation

### API Reference

- [Service Architecture](api/service-architecture.md) - AsgClientService and component integration
- [Bluetooth Commands](api/bluetooth-commands.md) - Command reference for BLE communication
- [Event System](api/event-system.md) - EventBus events and handlers

### Advanced Topics

- [Bluetooth Managers](advanced/bluetooth-managers.md) - Different Bluetooth implementations
- [Network Managers](advanced/network-managers.md) - WiFi and network management
- [OTA Updates](advanced/ota-updates.md) - Over-the-air update system

### Troubleshooting

- [Common Issues](troubleshooting/common-issues.md) - Frequently encountered problems
- [Debug Guide](troubleshooting/debug-guide.md) - Debugging tips and techniques

## 🚀 Quick Links

- **For Mentra Live users**: Start with [Mentra Live Setup](mentra-live-setup.md)
- **For developers**: Begin with [Overview](overview.md) and [Development Setup](development-setup.md)
- **API Reference**: Check [Service Architecture](api/service-architecture.md)

## 📋 Compatibility

The ASG Client is designed for Android-based smart glasses. Currently supported:

- **Mentra Live** (primary device)

With modifications, it could potentially support other Android-based smart glasses such as TCL Rayneo X2/X3, INMO Air 2/3, and others.
