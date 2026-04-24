#!/bin/bash

# ===============================
# 🧭 ROBINHOOD EXPORTER SETUP
# ===============================

set -e

echo "🚀 Starting Robinhood Exporter Setup..."

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js detected: $NODE_VERSION"

# 2. Navigate to project root (if not already there)
cd "$(dirname "$0")"

# 3. Handle Dependencies and Platform Mismatch
echo "📦 Installing/Updating dependencies..."
# Use --force to ensure platform-specific binaries for esbuild are correctly resolved
npm install --force

# 4. Build the extension
echo "🏗 Building the extension..."
if node build.js; then
    echo "✅ Build completed successfully!"
    echo "--------------------------------------------------"
    echo "🎉 SUCCESS! The extension is ready for use."
    echo "1. Open Chrome and go to: chrome://extensions/"
    echo "2. Enable 'Developer mode'."
    echo "3. Click 'Load unpacked' and select this folder:"
    echo "   $(pwd)"
    echo "--------------------------------------------------"
else
    echo "❌ Build failed. Please check the logs above."
    exit 1
fi
