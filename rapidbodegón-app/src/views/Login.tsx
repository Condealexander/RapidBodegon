import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Store, KeyRound, User as UserIcon } from 'lucide-react';
import { Card, CardContent, Input, Button, Label } from '../components/ui';

export const Login = () => {
  const { login } = useApp();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const success = login(name.trim(), pin);
    if (!success) {
      setError('Credenciales incorrectas. Verifique su nombre y PIN.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 text-blue-500 mb-4">
            <Store size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">RapidBodegón</h1>
          <p className="text-slate-400 mt-2">Control de Crédito y Consumo</p>
        </div>

        <Card>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
              
              <div>
                <Label htmlFor="name">Nombre de Usuario</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon size={18} className="text-slate-500" />
                  </div>
                  <Input 
                    id="name"
                    type="text" 
                    placeholder="Ej. ADMINISTRADOR o MILAGRITOS" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pin">PIN de Acceso</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound size={18} className="text-slate-500" />
                  </div>
                  <Input 
                    id="pin"
                    type="password" 
                    placeholder="****" 
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full py-2.5 text-base mt-2">
                Ingresar al Sistema
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 text-center mb-3">Datos Demo:</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <p className="text-slate-300 font-medium">Admin</p>
                  <p className="text-slate-500">ADMINISTRADOR / 1234</p>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                  <p className="text-slate-300 font-medium">Cliente</p>
                  <p className="text-slate-500">JESUS LAMBIS / 0000</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
