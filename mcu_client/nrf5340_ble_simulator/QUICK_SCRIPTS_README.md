# Quick Development Scripts

These local scripts make development faster by providing one-command build and flash operations.

## Available Scripts

### `./quick_build.sh`
- **Purpose**: Build firmware only (no flashing)
- **Usage**: `./quick_build.sh`
- **Output**: Firmware files in `build/` directory

### `./quick_flash.sh`
- **Purpose**: Flash pre-built firmware to device
- **Usage**: `./quick_flash.sh`
- **Requires**: Existing `build/` directory with firmware

### `./quick_all.sh`
- **Purpose**: Build and flash in one command
- **Usage**: `./quick_all.sh`
- **Combines**: `quick_build.sh` + `quick_flash.sh`

### `./quick_monitor.sh`
- **Purpose**: Open serial monitor to view device output
- **Usage**: `./quick_monitor.sh [baudrate]`
- **Default**: 115200 baud
- **Example**: `./quick_monitor.sh 9600`

### `./quick_clean.sh`
- **Purpose**: Clean build artifacts and temporary files
- **Usage**: `./quick_clean.sh`
- **Removes**: `build/` directory and temp files

## Quick Workflow Examples

### Standard Development Cycle
```bash
# Build and flash
./quick_all.sh

# Monitor output
./quick_monitor.sh
```

### Iterative Development
```bash
# Build only (faster for checking compilation)
./quick_build.sh

# Flash when ready
./quick_flash.sh

# Monitor
./quick_monitor.sh
```

### Clean Build
```bash
# Clean previous build
./quick_clean.sh

# Fresh build and flash
./quick_all.sh
```

## Notes

- Scripts are **not tracked in Git** (see `.gitignore`)
- Scripts automatically set up Nordic SDK environment
- Error handling: Scripts exit on first error
- Device auto-detection for monitoring
- Color-coded output for better visibility

## Troubleshooting

### Build Issues
- Ensure Nordic nRF Connect SDK is installed at expected path
- Check that device is connected for flashing
- Try `./quick_clean.sh` for clean build

### Flash Issues
- Verify nRF5340DK is connected via USB
- Check device permissions
- Ensure build completed successfully first

### Monitor Issues
- Verify correct device path (script auto-detects)
- Check baudrate (default 115200)
- Ensure device is not busy with other processes
