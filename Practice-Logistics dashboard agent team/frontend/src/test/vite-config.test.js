// @vitest-environment node
// Node env: esbuild fails its TextEncoder invariant under jsdom.
import { describe, it, expect } from 'vitest'
import viteConfig from '../../vite.config.js'

describe('vite dev proxy', () => {
  it('forwards /api to the backend on port 3001 by default', () => {
    const config = viteConfig({ mode: 'test', command: 'serve' })
    expect(config.server.proxy['/api']).toBe('http://localhost:3001')
  })
})
