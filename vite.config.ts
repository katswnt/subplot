import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@subplot/domain/imports',
        replacement: path.resolve(__dirname, 'src/domain/imports/index.ts'),
      },
      {
        find: '@subplot/domain/streaming',
        replacement: path.resolve(__dirname, 'src/domain/streaming/index.ts'),
      },
      {
        find: '@subplot/api-client',
        replacement: path.resolve(__dirname, 'src/api-client/index.ts'),
      },
    ],
  },
})
