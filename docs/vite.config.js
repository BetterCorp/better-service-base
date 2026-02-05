import { defineConfig } from 'vite'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { discoverPlugins } from './scripts/plugin-discovery.js'

function copyVersionTxt() {
  let outDirAbs = ''
  return {
    name: 'copy-version-txt',
    apply: 'build',
    configResolved(config) {
      const base = config.root ? config.root : process.cwd()
      outDirAbs = path.isAbsolute(config.build.outDir)
        ? config.build.outDir
        : path.resolve(base, config.build.outDir)
    },
    async writeBundle() {
      try {
        const src = path.resolve(__dirname, '../version.txt')
        const dest = path.resolve(outDirAbs, 'version.txt')
        const buf = await fs.readFile(src)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, buf)
      } catch (err) {
        // ignore if version.txt missing
      }
    }
  }
}

function pluginDiscoveryPlugin() {
  return {
    name: 'bsb-plugin-discovery',

    async config(config) {
      console.log('🔌 Discovering BSB plugins...')

      // Clean .temp directory first
      const tempCleanDir = path.resolve(__dirname, 'src', '.temp')
      if (fsSync.existsSync(tempCleanDir)) {
        fsSync.rmSync(tempCleanDir, { recursive: true })
      }

      // Generate plugin pages directly to src/ root
      // This allows files at src/plugins/<category>/<id>/ to be served at /plugins/<category>/<id>/
      const result = await discoverPlugins({
        pluginsDir: path.resolve(__dirname, '../plugins/nodejs'),
        tempDir: path.resolve(__dirname, 'src'),
        publicDir: path.resolve(__dirname, 'public'),
      })

      console.log(`✅ Found ${result.plugins.length} plugins`)

      // Merge generated plugin pages with existing static pages
      return {
        build: {
          rollupOptions: {
            input: {
              ...config.build?.rollupOptions?.input,
              ...result.inputPages,
            }
          }
        }
      }
    }
  }
}

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Main pages
        'main': 'src/index.html',
        'overview': 'src/overview/index.html',
        '404': 'src/404.html',

        // Guides - Building Services
        'guides-nodejs': 'src/guides/nodejs/index.html',

        // Extending BSB
        'extending-nodejs': 'src/extending/nodejs/index.html',

        // Core Plugins
        'core-plugins': 'src/core-plugins/index.html',
        'core-plugins-config': 'src/core-plugins/config-default/index.html',
        'core-plugins-events': 'src/core-plugins/events-default/index.html',
        'core-plugins-observable': 'src/core-plugins/observable-default/index.html',

        // Plugin Marketplace
        'marketplace': 'src/marketplace/index.html',

        // Note: Plugin pages are auto-generated via pluginDiscoveryPlugin()

        // Legacy pages (keep for now, can remove later)
        'get-started': 'src/get-started/index.html',
        'architecture': 'src/architecture/index.html',
        'developer': 'src/developer/index.html',
        'nodejs-guide': 'src/languages/nodejs/index.html',
        'plugins': 'src/plugins/index.html'
      }
    }
  },
  server: {
    port: 3000,
    allowedHosts: ['durmr03.tail178679.ts.net']
  },
  preview: {
    port: 4174
  },
  plugins: [
    pluginDiscoveryPlugin(),
    copyVersionTxt(),
    {
      name: 'custom-404',
      apply: 'serve',
      configureServer(server) {
        const srcDir = path.resolve(__dirname, 'src')

        server.middlewares.use((req, res, next) => {
          if (!req.url || res.headersSent) {
            return next()
          }

          // Try to find the file in src directory
          let filePath = path.join(srcDir, req.url)

          // If URL ends with /, check for index.html
          if (req.url.endsWith('/')) {
            filePath = path.join(filePath, 'index.html')
          }

          // If file exists, let Vite handle it
          if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()) {
            return next()
          }

          // Check if it's an asset request
          if (req.url.includes('/assets/') || req.url.includes('/@')) {
            return next()
          }

          // File doesn't exist - serve 404
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html')
          const content = fsSync.readFileSync(path.resolve(srcDir, '404.html'), 'utf-8')
          res.end(content)
        })
      }
    }
  ]
})
