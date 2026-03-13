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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("highlight.js")) {
            return "highlight-vendor";
          }

          if (
            id.includes("/antd/") ||
            id.includes("@ant-design") ||
            id.includes("@rc-component") ||
            id.includes("rc-")
          ) {
            return "antd-vendor";
          }

          if (id.includes("dayjs")) {
            return "dayjs-vendor";
          }

          if (id.includes("react-router")) {
            return "router-vendor";
          }

          if (id.includes("/react/") || id.includes("react-dom")) {
            return "react-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    port: 6699,
    host: '0.0.0.0',
  },
  resolve: {
    alias: alias
  }
})
