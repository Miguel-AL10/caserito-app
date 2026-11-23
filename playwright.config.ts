import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const GEMINI_PUERTO = 54399;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // La IA (HU09, HU10, HU16) apunta a un Gemini simulado: las pruebas no gastan cuota ni dependen de Internet
  webServer: [
    {
      command: `node tests/e2e/gemini-simulado.mjs`,
      url: `http://127.0.0.1:${GEMINI_PUERTO}/salud`,
      reuseExistingServer: !process.env.CI,
      env: { GEMINI_SIMULADO_PUERTO: String(GEMINI_PUERTO) },
    },
    {
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { GEMINI_API_KEY: 'clave-de-prueba', GEMINI_API_URL: `http://127.0.0.1:${GEMINI_PUERTO}/v1beta` },
    },
  ],
});
