import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      css: true,
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'tests/browser/**'],
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }),
);
