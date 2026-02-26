import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    cssMinify: 'esbuild', // <-- Tambahkan perintah ini untuk menghindari error lightningcss
  }
})