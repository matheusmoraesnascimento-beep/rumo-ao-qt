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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chromium' } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/rumo-ao-qt/',
    reuseExistingServer: true,
    timeout: 120_000,
    // Variáveis do processo vencem o .env.local: o E2E nunca fala com o Supabase real.
    env: { VITE_APP_BASE_PATH: '/rumo-ao-qt/', VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_VAPID_PUBLIC_KEY: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM' },
  },
})
