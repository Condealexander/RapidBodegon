/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { Login } from './views/Login';
import { AdminView } from './views/AdminView';
import { ClientView } from './views/ClientView';

const MainApp = () => {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <Login />;
  }

  return currentUser.role === 'ADMIN' ? <AdminView /> : <ClientView />;
};

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
