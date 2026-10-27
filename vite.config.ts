import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  test: {
    // Ecology regressions simulate hundreds of years, so allow realistic
    // budgets on shared CI runners without scheduling excessive workers.
    testTimeout: 45000,
    maxWorkers: 2,
  },
});
