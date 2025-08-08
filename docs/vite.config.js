import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/index.html',
        'get-started': 'src/get-started/index.html',
        'nodejs-guide': 'src/languages/nodejs/index.html',
        'plugins': 'src/plugins/index.html'
      }
    }
  },
  server: {
    port: 3000
  }
})