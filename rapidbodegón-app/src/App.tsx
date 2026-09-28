/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
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

const MainApp = () => {
  const { currentUser, authLoading } = useApp();

  // Mientras Firebase restaura la sesión guardada, no mostramos el Login
  // (evita el destello de "Ingresar al Sistema" al recargar estando logueado).
  if (authLoading) {
    return <LoadingScreen text="Cargando..." />;
  }

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

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}