
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env vars regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      'process.env': env
    },
    server: {
      port: 3000,
      strictPort: true,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy vendor libraries so page code loads without them
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            charts: ['recharts'],
            excel: ['xlsx'],
            capture: ['html2canvas'],
            motion: ['framer-motion'],
            ai: ['@google/genai'],
          },
        },
      },
    },
  }
})
