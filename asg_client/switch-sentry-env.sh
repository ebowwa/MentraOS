#!/bin/bash

# Sentry Environment Switcher for ASG Client
# This script helps switch between different Sentry environment configurations

set -e

ENV=${1:-development}

echo "🔧 Switching Sentry Configuration to: $ENV"
echo "============================================="
echo ""

# Check if the environment configuration exists
CONFIG_FILE="app/src/main/assets/sentry.properties.$ENV"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file not found: $CONFIG_FILE"
    echo ""
    echo "Available environments:"
    echo "  - development (default)"
    echo "  - staging"
    echo "  - production"
    echo ""
    echo "Usage: ./switch-sentry-env.sh [environment]"
    exit 1
fi

# Backup current configuration if it exists
if [ -f "app/src/main/assets/sentry.properties" ]; then
    echo "📋 Backing up current configuration..."
    cp app/src/main/assets/sentry.properties app/src/main/assets/sentry.properties.backup
fi

# Copy the environment-specific configuration
echo "📋 Switching to $ENV configuration..."
cp "$CONFIG_FILE" app/src/main/assets/sentry.properties

echo ""
echo "✅ Sentry configuration switched to: $ENV"
echo ""
echo "📝 Configuration details:"
echo "   Environment: $ENV"
echo "   DSN: https://b9741072e209679b5afe7d613ce4966b@o4509753650249728.ingest.us.sentry.io/4509753949028352"
echo "   Organization: ahmad-wv"
echo "   Project: asg"
echo ""
echo "🔒 Note: Configuration files are in .gitignore for security"
echo ""
echo "📚 To restore previous configuration:"
echo "   cp app/src/main/assets/sentry.properties.backup app/src/main/assets/sentry.properties" 