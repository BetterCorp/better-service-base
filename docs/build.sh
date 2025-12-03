#!/bin/bash

# BSB Documentation Build Script
echo "Building BSB Documentation..."

# Clean previous build
rm -rf dist/

# Build with Vite
npm run build

# Components are handled by Vite build

oldpath=$PWD
cd ../nodejs
npm run docs
cd $oldpath

echo "Build complete! Documentation ready in dist/"