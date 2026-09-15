import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Store, KeyRound, User as UserIcon, UserPlus, LogIn } from 'lucide-react';
import { Card, CardContent, Input, Button, Label } from '../components/ui';

export const Login = () => {
  const { login, register } = useApp();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin.length < 6) {
      setError('El PIN debe tener al menos 6 dígitos.');
      return;
    }

    if (isRegistering) {
      const success = await register(name, pin);
      if (!success) {
        setError('Ya existe un usuario registrado con ese nombre.');
      }
    } else {
      const success = login(name.trim(), pin);
      if (!success) {
        setError('Credenciales incorrectas. Verifique su nombre y PIN.');
      }
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
            {/* Selector entre Iniciar Sesión y Registro */}
            <div className="flex border-b border-slate-700/50 mb-6 pb-2 gap-4 justify-center">
              <button
                type="button"
                className={`flex items-center gap-2 pb-2 text-sm font-medium transition-colors border-b-2 ${
                  !isRegistering
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => { setIsRegistering(false); setError(''); }}
              >
                <LogIn size={16} /> Iniciar Sesión
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 pb-2 text-sm font-medium transition-colors border-b-2 ${
                  isRegistering
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => { setIsRegistering(true); setError(''); }}
              >
                <UserPlus size={16} /> Registrarme
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="name">Nombre y Apellido</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon size={18} className="text-slate-500" />
                  </div>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Ej. JUAN PEREZ"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pin">PIN Secreto (mínimo 4 dígitos)</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound size={18} className="text-slate-500" />
                  </div>
                  <Input
                    id="pin"
                    type="password"
                    maxLength={6}
                    placeholder="****"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full py-2.5 text-base mt-2">
                {isRegistering ? 'Crear mi cuenta' : 'Ingresar al Sistema'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
