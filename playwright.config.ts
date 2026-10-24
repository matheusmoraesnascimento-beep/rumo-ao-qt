import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke E2E do build estático servido na subpasta /rumo-ao-qt/ (como no GitHub Pages).
 * Fluxos com login real exigem um projeto Supabase de teste: veja docs/TESTES.md (E2E_SUPABASE_*).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/rumo-ao-qt/',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_APP_BASE_PATH: '/rumo-ao-qt/', VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
  },
})
