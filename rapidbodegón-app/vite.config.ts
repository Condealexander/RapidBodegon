import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(process.env.ANALYZE === 'true'
        ? [visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true, brotliSize: true })]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
              // Separa los SDK que inflan el chunk inicial, sin agrupar React
              // manualmente (Vite ya comparte esos módulos con sus dependientes).
              'firebase-auth': ['firebase/auth'],
              'firebase-firestore': ['firebase/firestore'],
              'firebase-app': ['firebase/app'],
              'firebase-re2': ['re2js'],
            // Estas dos librerías solo las usa AdminView.tsx y pesan mucho.
            // Separarlas en su propio archivo significa que un cliente
            // normal (que nunca abre el panel de admin) no las descarga.
            recharts: ['recharts'],
            xlsx: ['xlsx'],
          },
        },
      },
    },
  };
});
