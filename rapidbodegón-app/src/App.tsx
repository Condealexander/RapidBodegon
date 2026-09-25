/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { Login } from './views/Login';
import { ClientView } from './views/ClientView';

// AdminView carga recharts y xlsx, que son pesados y solo los necesita un
// admin. Con lazy(), ese código ni siquiera se descarga para un cliente
// normal — solo se pide cuando currentUser.role === 'ADMIN' realmente
// renderiza este componente.
const AdminView = lazy(() =>
  import('./views/AdminView').then(module => ({ default: module.AdminView }))
);

const AdminViewFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    color: '#94a3b8',
    fontSize: 14
  }}>
    Cargando panel de administración...
  </div>
);

const MainApp = () => {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <Login />;
  }

  if (currentUser.role === 'ADMIN') {
    return (
      <Suspense fallback={<AdminViewFallback />}>
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