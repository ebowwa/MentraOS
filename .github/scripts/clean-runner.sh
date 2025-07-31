#!/bin/bash
# Script to clean up self-hosted runner environment

echo "Cleaning up self-hosted runner environment..."

# Clean up pnpm caches and stores
echo "Cleaning pnpm caches..."
rm -rf ~/.pnpm-store
rm -rf ~/.cache/pnpm
rm -rf ~/.local/share/pnpm
rm -rf ~/.pnpm

# Clean up work directories
echo "Cleaning work directories..."
for dir in /home/*/actions-runner*/_work/*/; do
  if [ -d "$dir" ]; then
    echo "Cleaning $dir"
    find "$dir" -name "node_modules" -type d -prune -exec rm -rf {} +
    find "$dir" -name ".pnpm-store" -type d -prune -exec rm -rf {} +
    find "$dir" -name ".pnpm" -type d -prune -exec rm -rf {} +
  fi
done

# Clean up npm/yarn caches (in case they're used)
echo "Cleaning npm/yarn caches..."
npm cache clean --force 2>/dev/null || true
yarn cache clean 2>/dev/null || true

# Clean up gradle caches
echo "Cleaning gradle caches..."
rm -rf ~/.gradle/caches/*

echo "Cleanup complete!"