import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/WorldForge/',
  test: {
    // Long ecological histories are CPU-heavy. Run one file at a time so
    // independent 30-second simulation tests do not starve each other in CI.
    testTimeout: 45000,
    maxWorkers: 1,
  },
});
