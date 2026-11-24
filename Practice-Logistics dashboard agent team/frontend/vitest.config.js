import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test-only config. Product config stays in vite.config.js.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
})
