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

const getPackageName = (id: string) => {
  const normalized = id.replace(/\\/g, '/');
  const segments = normalized.split('/node_modules/');
  if (segments.length < 2) return null;

  const modulePath = segments[1];
  const parts = modulePath.split('/');
  if (!parts.length) return null;

  if (parts[0].startsWith('@')) {
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  }

  return parts[0];
};

const toChunkName = (name: string) =>
  name.replace(/^@/, '').replace(/[\\/]/g, '-');


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

          const packageName = getPackageName(id);
          if (!packageName) return "vendor";

          if (packageName === "highlight.js") {
            return "highlight-vendor";
          }

          if (packageName === "react" || packageName === "react-dom" || packageName === "scheduler") {
            return "react-vendor";
          }

          if (packageName === "react-router") {
            return "router-vendor";
          }

          if (packageName === "dayjs") {
            return "dayjs-vendor";
          }

          if (packageName === "antd") {
            const normalized = id.replace(/\\/g, '/');
            const antdSegment = normalized.match(/\/node_modules\/antd\/(?:es|lib)\/([^/]+)/)?.[1];
            if (antdSegment) {
              return `antd-${toChunkName(antdSegment)}`;
            }
            return "antd-core";
          }

          if (
            packageName.startsWith("@ant-design") ||
            packageName.startsWith("@rc-component/") ||
            packageName.startsWith("rc-")
          ) {
            return `antd-${toChunkName(packageName)}`;
          }

          return `vendor-${toChunkName(packageName)}`;
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
