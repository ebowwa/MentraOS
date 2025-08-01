#!/bin/bash

# Setup script for MentraOS Mobile Environment
# This script helps developers set up their environment variables securely

set -e

echo "🔐 MentraOS Mobile Environment Setup"
echo "====================================="

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy template
if [ -f "env.example" ]; then
    cp env.example .env
    echo "✅ Copied env.example to .env"
else
    echo "❌ env.example not found!"
    exit 1
fi

echo ""
echo "📝 Please edit .env with your actual credentials:"
echo ""

# Check if we can open the file
if command -v code &> /dev/null; then
    echo "Opening .env in VS Code..."
    code .env
elif command -v nano &> /dev/null; then
    echo "Opening .env in nano..."
    nano .env
elif command -v vim &> /dev/null; then
    echo "Opening .env in vim..."
    vim .env
else
    echo "Please manually edit the .env file with your credentials."
fi

echo ""
echo "🔍 Required credentials:"
echo "======================="
echo ""
echo "Sentry:"
echo "  - SENTRY_DSN: Get from Sentry.io → Settings → Projects → Client Keys (DSN)"
echo "  - SENTRY_ORG: Your organization slug"
echo "  - SENTRY_PROJECT: Your project slug"
echo ""
echo "PostHog:"
echo "  - POSTHOG_API_KEY: Get from PostHog.com → Settings → Project API Keys"
echo "  - POSTHOG_HOST: Usually https://app.posthog.com"
echo ""
echo "📚 For detailed instructions, see SECURITY.md"
echo ""
echo "✅ Setup complete! Run 'bun install' to install dependencies." 