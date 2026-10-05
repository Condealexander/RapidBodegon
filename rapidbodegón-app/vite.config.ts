import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'logo192.png', 'logo512.png'],
        manifest: {
          name: 'RapidBodegón - Control de Crédito',
          short_name: 'RapidBodegón',
          description: 'Sistema interno de gestión de crédito, pagos, inventario y cobranza.',
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          start_url: '.',
          scope: '/',
          icons: [
            {
              src: '/logo192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: '/logo512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
          globIgnores: ['**/stats.html'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => /https?:\/\/(firestore\.googleapis\.com|securetoken\.googleapis\.com|identitytoolkit\.googleapis\.com|www\.googleapis\.com)/.test(url.href),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'firebase-network-first',
                networkTimeoutSeconds: 10,
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24,
                },
              },
            },
            {
              urlPattern: ({ request }) =>
                request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'image' ||
                request.destination === 'font',
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
      }),
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
            // XLSX se carga de forma dinámica solo cuando se importa inventario.
            xlsx: ['xlsx'],
          },
        },
      },
    },
  };
});
