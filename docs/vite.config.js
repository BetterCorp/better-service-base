import { defineConfig } from 'vite'
import fs from 'node:fs/promises'
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
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Main pages
        'main': 'src/index.html',
        'overview': 'src/overview/index.html',

        // Guides - Building Services
        'guides-nodejs': 'src/guides/nodejs/index.html',

        // Extending BSB
        'extending-nodejs': 'src/extending/nodejs/index.html',

        // Core Plugins
        'core-plugins': 'src/core-plugins/index.html',
        'core-plugins-config': 'src/core-plugins/config-default/index.html',
        'core-plugins-events': 'src/core-plugins/events-default/index.html',
        'core-plugins-logging': 'src/core-plugins/logging-default/index.html',
        'core-plugins-metrics': 'src/core-plugins/metrics-default/index.html',

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
  plugins: [copyVersionTxt()]
})
