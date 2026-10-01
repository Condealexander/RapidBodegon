import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Store, KeyRound, User as UserIcon, UserPlus, LogIn, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, Input, Button, Label } from '../components';

export const Login = () => {
  const { login, register } = useApp();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (registering: boolean) => {
    setIsRegistering(registering);
    setError('');
    setPin('');
    setConfirmPin('');
    setShowPin(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    // Estas reglas aplican SOLO al registrarse. En el login no se valida
    // longitud para no bloquear a clientes con un PIN anterior más corto.
    if (isRegistering) {
      if (name.trim().split(/\s+/).length < 2) {
        setError('Escribe tu nombre y apellido !(-.-).');
        return;
      }
      if (pin.length < 8) {
        setError('El PIN debe tener al menos 8 dígitos !(-.-).');
        return;
      }
      if (pin !== confirmPin) {
        setError('Los PIN no coinciden (o_o¡).');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = isRegistering
        ? await register(name, pin)
        : await login(name.trim(), pin);

      if (!result.success) {
        setError(
          result.error ||
            (isRegistering
              ? 'No se pudo completar el registro (o_o¡).'
              : 'Credenciales incorrectas. Verifique su nombre y PIN (0_0).')
        );
      }
    } finally {
      setSubmitting(false);
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
            <div className="flex border-b border-slate-700/50 mb-6 pb-2 gap-4 justify-center">
              <button
                type="button"
                className={`flex items-center gap-2 pb-2 text-sm font-medium transition-colors border-b-2 ${
                  !isRegistering
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => switchMode(false)}
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
                onClick={() => switchMode(true)}
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
                    autoComplete="username"
                    placeholder="Ej. JUAN PEREZ"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="pin">
                  {isRegistering ? 'PIN Secreto (mínimo 8 dígitos)' : 'PIN Secreto'}
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound size={18} className="text-slate-500" />
                  </div>
                  <Input
                    id="pin"
                    type={showPin ? 'text' : 'password'}
                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                    placeholder="********"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                    onClick={() => setShowPin(v => !v)}
                    aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {isRegistering && (
                <div>
                  <Label htmlFor="confirmPin">Confirma tu PIN</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound size={18} className="text-slate-500" />
                    </div>
                    <Input
                      id="confirmPin"
                      type={showPin ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="********"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full py-2.5 text-base mt-2" disabled={submitting}>
                {submitting ? 'Procesando...' : (isRegistering ? 'Crear mi cuenta' : 'Ingresar al Sistema')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};