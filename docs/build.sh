#!/bin/bash

# BSB Documentation Build Script
# Builds all documentation for BSB including:
# - Vite-based documentation site

echo "Building BSB Documentation..."

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist/

# Build site only (API reference is hosted separately on types.bsbcode.dev)
echo "Building documentation site..."
npm run build

echo ""
echo "Build complete! Documentation ready in dist/"
echo "  - Site: dist/index.html"
echo "  - Node.js API: https://types.bsbcode.dev/nodejs/"
