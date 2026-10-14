import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5000,
    strictPort: false, // Allows fallback to another port if 5000 is taken
    proxy: {
      '/api': {
        target: process.env.RADAR_API_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})
