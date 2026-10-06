/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react';
import './theme-overrides.css';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const registerServiceWorker = () => {
  window.setTimeout(() => {
    registerSW({
      immediate: true,
      onOfflineReady() {
        console.info('PWA lista para uso sin conexión.');
      },
    });
  }, 1200);
};

if (document.readyState === 'complete') {
  registerServiceWorker();
} else {
  window.addEventListener('load', registerServiceWorker, { once: true });
}
