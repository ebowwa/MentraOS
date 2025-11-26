# CLI Tool Specification

## Overview

`mentra-cli` is a command-line tool for interacting with MentraOS Cloud. It uses `@mentra/client-sdk` to simulate a device, enabling automated testing and manual debugging.

## Goals

1. **Automated Testing**: Run scripted scenarios to verify TPA/Cloud behavior.
2. **Manual Simulation**: Interactive shell for sending hardware events.
3. **CI/CD Integration**: Headless execution for pipeline tests.

## Commands

### `simulate`
Starts an interactive simulation session.

```bash
$ mentra-cli simulate --profile mach1 --token $TOKEN
> Connected to wss://api.mentra.glass
> Type 'help' for commands

mentra> press main short
[SENT] button_press: main (short)

mentra> touch tap
[SENT] touch_event: tap

[RECV] display_event: text_wall "Hello World"
```

### `run-script`
Executes a JSON test scenario.

```bash
$ mentra-cli run-script ./test-scenario.json
```

**Scenario Format**:
```json
{
  "steps": [
    { "action": "connect" },
    { "action": "press", "button": "main", "type": "short" },
    { "expect": "display", "timeout": 5000 }
  ]
}
```

## Constraints

- Must be distributable as a standalone binary or global npm package.
- Must support environment variables for configuration (host, token).
