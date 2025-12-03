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
        main: 'src/index.html',
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