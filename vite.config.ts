import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Subplot's own Vite app. Workspace packages are aliased straight to their
// TypeScript source (same trick as the root app) so there's no build step for
// @letterboxd-wrappd/domain or /api-client during dev or the app's own build.
const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@letterboxd-wrappd\/domain\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/domain/src/$1'),
      },
      {
        find: '@letterboxd-wrappd/domain',
        replacement: path.resolve(repoRoot, 'packages/domain/src/index.ts'),
      },
      {
        find: /^@letterboxd-wrappd\/api-client\/(.*)$/,
        replacement: path.resolve(repoRoot, 'packages/api-client/src/$1'),
      },
      {
        find: '@letterboxd-wrappd/api-client',
        replacement: path.resolve(repoRoot, 'packages/api-client/src/index.ts'),
      },
    ],
  },
})
