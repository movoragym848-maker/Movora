import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Alias any imports of @juggle/resize-observer to resize-observer-polyfill
// This ensures Rollup/Vite can resolve the module during build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@juggle/resize-observer': 'resize-observer-polyfill'
    }
  },
  build: {
    sourcemap: true,
    minify: false
  }
});
