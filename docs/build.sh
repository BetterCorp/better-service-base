#!/bin/bash

# BSB Documentation Build Script
# Builds all documentation for BSB including:
# - Vite-based documentation site
# - TypeDoc API reference for Node.js

echo "Building BSB Documentation..."

# Clean previous build
echo "Cleaning previous build..."
rm -rf dist/

# Build everything (Vite site + TypeDoc API reference)
# This runs:
#   1. vite build - builds the documentation site
#   2. build-types:nodejs - generates TypeDoc API reference from ../nodejs/src
echo "Building documentation site and API references..."
npm run build

echo ""
echo "Build complete! Documentation ready in dist/"
echo "  - Site: dist/index.html"
echo "  - Node.js API: dist/languages/nodejs/types/index.html"