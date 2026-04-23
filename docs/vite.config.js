import { defineConfig } from 'vite'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

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

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  define: {
    __BSB_REGISTRY_URL__: JSON.stringify(process.env.BSB_DOCS_REGISTRY_URL || 'https://io.bsbcode.dev/plugins'),
    __BSB_DOCS_BUILD_VERSION__: JSON.stringify(JSON.parse(fsSync.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version),
    __BSB_DOCS_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
        'guides-nodejs-build-hooks': 'src/guides/nodejs/build-hooks/index.html',

        // Extending BSB
        'extending-nodejs': 'src/extending/nodejs/index.html',

        // Core Plugins
        'core-plugins': 'src/core-plugins/index.html',

        // External Plugin Registry Redirect
        'registry': 'src/registry/index.html',

        // Legacy pages
        'get-started': 'src/get-started/index.html',
        'architecture': 'src/architecture/index.html',
        'developer': 'src/developer/index.html',
        'nodejs-guide': 'src/languages/nodejs/index.html'
      }
    }
  },
  server: {
    port: 3000,
    allowedHosts: ['bsbcode.dev','www.bsbcode.dev']
  },
  preview: {
    port: 4174
  },
  plugins: [
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
