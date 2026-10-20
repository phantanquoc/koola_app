import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    // Tests import config.ts which fail-fasts on missing VITE_API_URL —
    // give it a dummy value so unit tests never touch a real backend.
    env: {
      VITE_API_URL: 'http://localhost:3000/api',
    },
  },
});
