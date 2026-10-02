/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { Login } from './views/Login';
import { ClientView } from './views/ClientView';

// AdminView arrastra recharts y xlsx (pesados); solo se descarga si entra un admin.
const AdminView = lazy(() =>
  import('./views/AdminView').then(module => ({ default: module.AdminView }))
);

const LoadingScreen = ({ text }: { text: string }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#020617',
    color: '#94a3b8',
    fontSize: 14
  }}>
    {text}
  </div>
);

const OfflineNotice = () => (
  <div
    role="status"
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      width: '100%',
      background: '#f59e0b',
      color: '#111827',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 13,
      padding: '10px 14px',
      letterSpacing: '0.02em',
    }}
  >
    Sin conexión — último saldo conocido
  </div>
);

const MainApp = () => {
  const { currentUser, authLoading } = useApp();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Mientras Firebase restaura la sesión guardada, no mostramos el Login
  // (evita el destello de "Ingresar al Sistema" al recargar estando logueado).
  if (authLoading) {
    return <LoadingScreen text="Cargando..." />;
  }

  const renderContent = () => {
    if (!currentUser) {
      return <Login />;
    }

    if (currentUser.role === 'ADMIN') {
      return (
        <Suspense fallback={<LoadingScreen text="Cargando panel de administración..." />}>
          <AdminView />
        </Suspense>
      );
    }

    return <ClientView />;
  };

  return (
    <>
      {isOffline && <OfflineNotice />}
      {renderContent()}
    </>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}