# 004: CLI Tool

Build `mentra-cli` for automated testing and manual simulation.

## Documents

- **cli-spec.md** - Goals, commands, constraints
- **cli-architecture.md** - System design, components, directory structure

## Status

📋 **Planned** - Blocked by 003-client-sdk-implementation

## Quick Context

**Goal**: Command-line tool for testing TPAs without physical glasses

**Depends on**: `@mentra/client-sdk`

## Planned Features

### Interactive Mode
```bash
mentra-cli simulate --profile mach1
> press main short
> touch tap
> speak "hello world"
```

### Script Mode (CI/CD)
```bash
mentra-cli run-script ./test-scenario.json
```

### Device Profiles
- `mach1` - Full Mentra Mach 1 capabilities
- `display-only` - No camera/mic
- `camera-only` - No display
- Custom profiles via config file

## Next Steps

1. Wait for client SDK implementation
2. Design CLI interface
3. Implement interactive mode
4. Implement script mode
5. Add device profile system
6. Write documentation
