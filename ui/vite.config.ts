import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {resolve} from "path";

const pathResolve = (dir: string) => {
  return resolve(__dirname, '.', dir)
}

const alias: Record<string, string> = {
  '@': pathResolve('./src'),
  '@extension': pathResolve('../extension'),
}


// https://vite.dev/config/
export default defineConfig({
  // base: '/ts-swagger/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 6699,
    host: '0.0.0.0',
  },
  resolve: {
    alias: alias
  }
})
