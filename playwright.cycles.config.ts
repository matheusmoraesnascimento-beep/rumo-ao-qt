import { defineConfig, devices } from '@playwright/test'

// Isolated build with a fictitious endpoint. Every Supabase request is intercepted by the tests.
const node = `'${process.execPath.replace(/'/g, `'\\''`)}'`
const output = '/tmp/rumo-qt-auth-e2e'
export default defineConfig({
  testDir: 'tests/e2e-auth',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4174',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chromium' } },
  ],
  webServer: {
    command: `${node} node_modules/vite/bin/vite.js build --outDir ${output} && ${node} node_modules/vite/bin/vite.js preview --outDir ${output} --port 4174 --strictPort`,
    url: 'http://localhost:4174/rumo-ao-qt/',
    timeout: 120_000,
    env: {
      VITE_APP_BASE_PATH: '/rumo-ao-qt/',
      VITE_SUPABASE_URL: 'https://study-plan.test',
      VITE_SUPABASE_ANON_KEY: 'public-e2e-placeholder',
      VITE_VAPID_PUBLIC_KEY: '',
    },
  },
})
