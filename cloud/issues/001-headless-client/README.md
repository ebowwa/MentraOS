# 001: Mantle SDK (Shared Client Core)

**Goal**: Create a unified `@mentra/client-sdk` that serves as the **Mantle** (Shared Logic Layer) for the Mentra Client ecosystem.

## Strategy: The Mantle

Instead of building a separate "simulation" library, we are extracting the core logic from the mobile app into a portable SDK called the **Mantle**. This SDK will power:
1.  **The Mobile App (Production)**: Using React Native adapters.
2.  **The Headless Client (Testing)**: Using Node.js adapters.

This ensures that our automated tests run against the **exact same logic** as the production app, eliminating "logic drift" and enabling robust E2E testing.

## Documents

- **[headless-client-spec.md](./headless-client-spec.md)** - The "Shared Core" specification.
- **[headless-client-architecture.md](./headless-client-architecture.md)** - Hexagonal Architecture (Ports & Adapters).
- **[001-protocol-specification](./001-protocol-specification/)** - Complete Protocol Reference.

## Sub-Issues

1.  **[001-protocol-specification](./001-protocol-specification/)** - ✅ Complete
    - Documented all Client↔Cloud and App↔Cloud message types.
    
2.  **[002-types-consolidation](./002-types-consolidation/)** - 🟡 In Progress
    - Extract protocol types into `@mentra/types` package.
    
3.  **[003-client-sdk-implementation](./003-client-sdk-implementation/)** - 🔄 Refactoring
    - Implement `@mentra/client-sdk` using Hexagonal Architecture.
    - Extract logic from Mobile App.
    
4.  **[004-mobile-integration](./004-mobile-integration/)** - 📋 Planned
    - Integrate SDK into Mobile App (replace legacy `SocketComms`).
    
5.  **[005-headless-test-runner](./005-headless-test-runner/)** - 📋 Planned
    - Build Node.js test runner using the SDK.

## Status

- [x] Protocol specification documented
- [x] Mobile Client Audit complete
- [x] Architecture defined (Hexagonal)
- [ ] SDK Core implemented
- [ ] Node.js Adapters implemented
- [ ] React Native Adapters implemented

