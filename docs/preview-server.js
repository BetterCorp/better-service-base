#!/usr/bin/env node

/**
 * Custom preview server with proper 404 handling
 * Uses sirv to serve the dist directory with custom 404 page
 */

import sirv from 'sirv'
import polka from 'polka'
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distDir = resolve(__dirname, 'dist')
const port = process.env.PORT || 4174

// Read 404 page content
const notFoundPage = readFileSync(resolve(distDir, '404.html'), 'utf-8')

// Create sirv middleware with options for MPA (not SPA)
const assets = sirv(distDir, {
  maxAge: 31536000, // 1 year for immutable assets
  immutable: true,
  single: false, // Don't fallback to index.html for missing routes
  dev: false,
  etag: true,
  dotfiles: false
})

// Create server
const server = polka()

// Serve static files first
server.use(assets)

// Custom 404 handler for HTML pages only
server.use((req, res) => {
  // Only serve custom 404 page for HTML requests (not assets)
  // If it's an asset request that sirv couldn't serve, let it fail naturally
  const isLikelyHtmlRequest = !req.url.includes('.') || req.url.endsWith('/') || req.url.endsWith('.html')

  if (isLikelyHtmlRequest && !res.headersSent) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/html')
    res.end(notFoundPage)
  }
})

// Start server
server.listen(port, (err) => {
  if (err) throw err
  console.log(`\n  \x1b[32m➜\x1b[0m  \x1b[1mLocal\x1b[0m:   \x1b[36mhttp://localhost:\x1b[1m${port}\x1b[0m\x1b[36m/\x1b[0m\n`)
})
