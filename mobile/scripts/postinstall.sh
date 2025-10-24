# runs after bun install
# patches packages and builds / installs core module
patch-package
cd node_modules/core
bun install
bun run prepare
