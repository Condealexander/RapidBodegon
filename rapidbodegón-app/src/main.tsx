/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react';
import './theme-overrides.css';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { initializeTheme } from './components/useTheme';
import './index.css';

initializeTheme();

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);
const PRELOAD_ERROR_KEY = 'rb_preload_error_reload_at';
const PRELOAD_ERROR_RETRY_WINDOW = 60_000;

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  let shouldReload = false;
  try {
    const lastRecovery = Number(sessionStorage.getItem(PRELOAD_ERROR_KEY));
    shouldReload = !lastRecovery || Date.now() - lastRecovery > PRELOAD_ERROR_RETRY_WINDOW;

    if (shouldReload) {
      sessionStorage.setItem(PRELOAD_ERROR_KEY, String(Date.now()));
    }
  } catch (error) {
    shouldReload = false;
    console.error('No se pudo comprobar el estado de recuperación de la aplicación.', error);
  }

  if (shouldReload) {
    window.location.reload();
    return;
  }

  root.render(
    <div
      role="alert"
      style={{
        display: 'grid',
        minHeight: '100vh',
        placeContent: 'center',
        gap: 16,
        padding: 24,
        background: '#020617',
        color: '#f8fafc',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <p>Hay una versión nueva de la aplicación. Recarga para continuar.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          justifySelf: 'center',
          border: 0,
          borderRadius: 8,
          padding: '10px 16px',
          background: '#fbbf24',
          color: '#422006',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Recargar aplicación
      </button>
    </div>,
  );
});

root.render(
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
