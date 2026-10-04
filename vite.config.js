import { defineConfig } from 'vite'
import { agentBridge } from './vite-agent-bridge.js'

export default defineConfig({
  root: '.',
  plugins: [
    agentBridge(),
  ],
  server: {
    open: true,
    port: 5173
  },
  build: {
    target: 'esnext',
    outDir: 'dist'
  }
})
