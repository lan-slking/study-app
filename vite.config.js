import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// No /api proxy needed: the backend is now Vercel Serverless Functions under
// api/, served alongside the frontend by `vercel dev` (which also runs this
// Vite dev server itself) — use that instead of a bare `vite dev` for local
// work that touches the backend.
export default defineConfig({
  plugins: [react()],
})
