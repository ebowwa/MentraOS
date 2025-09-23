#!/bin/bash

# Sentry Setup Script for ASG Client
# This script helps developers set up Sentry configuration securely

set -e

echo "🔧 Sentry Configuration Setup for ASG Client"
echo "============================================="
echo ""

# Check if sentry.properties already exists
if [ -f "app/src/main/assets/sentry.properties" ]; then
    echo "⚠️  sentry.properties already exists!"
    echo "   Current file:"
    cat app/src/main/assets/sentry.properties
    echo ""
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy example file
echo "📋 Copying example configuration..."
cp app/src/main/assets/sentry.properties.example app/src/main/assets/sentry.properties

echo ""
echo "✅ Sentry configuration file created!"
echo ""
echo "📝 Next steps:"
echo "1. Edit app/src/main/assets/sentry.properties"
echo "2. Replace 'your-actual-dsn@sentry.io/your-project-id' with your real Sentry DSN"
echo "3. Set sentry.enabled=true to enable Sentry"
echo "4. Customize other settings as needed"
echo ""
echo "🔒 Security note: The sentry.properties file is already in .gitignore"
echo "   so your DSN won't be committed to version control."
echo ""
echo "📚 For more information, see SENTRY_CONFIGURATION.md" 