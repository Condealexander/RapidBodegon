import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  Store,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, Input, Button, Label } from '../components';

const snackShapes = ['🍿', '🥨', '🍪', '🍫', '🥜', '🍟', '🍩', '🍿', '🥨', '🍪'];

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
    <main className="login-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <div className="login-snack-rain" aria-hidden="true">
        {snackShapes.map((snack, index) => (
          <span className="login-snack" key={`${snack}-${index}`}>{snack}</span>
        ))}
      </div>
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />

      <div className="login-content relative z-10 w-full max-w-md">
        <header className="mb-7 text-center sm:mb-8">
          <div className="login-mark-wrap mx-auto mb-5">
            <div className="login-mark">
              <Store size={32} strokeWidth={1.8} aria-hidden="true" />
            </div>
          </div>
          <p className="login-eyebrow">Tu bodega, más cerca</p>
          <h1 className="login-title">RapidBodegón</h1>
          <p className="login-description">Control de crédito y consumo</p>
        </header>

        <Card className="login-card">
          <CardContent className="login-card-content">
            <div className="login-mode-switch mb-6" role="group" aria-label="Tipo de acceso">
              <button
                type="button"
                aria-pressed={!isRegistering}
                className={`login-mode-button flex items-center justify-center gap-2 ${!isRegistering ? 'is-active' : ''}`}
                onClick={() => switchMode(false)}
              >
                <LogIn size={16} aria-hidden="true" /> Iniciar sesión
              </button>
              <button
                type="button"
                aria-pressed={isRegistering}
                className={`login-mode-button flex items-center justify-center gap-2 ${isRegistering ? 'is-active' : ''}`}
                onClick={() => switchMode(true)}
              >
                <UserPlus size={16} aria-hidden="true" /> Registrarme
              </button>
            </div>

            <form onSubmit={handleSubmit} className="login-form space-y-5">
              {error && (
                <div role="alert" className="login-error rounded-lg border p-3 text-center text-sm">
                  {error}
                </div>
              )}

              <div>
                <Label htmlFor="name" className="login-label">Nombre y apellido</Label>
                <div className="login-field-shell relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon size={18} className="login-input-icon" aria-hidden="true" />
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
                <Label htmlFor="pin" className="login-label">
                  {isRegistering ? 'PIN Secreto (mínimo 8 dígitos)' : 'PIN Secreto'}
                </Label>
                <div className="login-field-shell relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound size={18} className="login-input-icon" aria-hidden="true" />
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
                    className="login-visibility-button absolute inset-y-0 right-0 flex items-center pr-3"
                    onClick={() => setShowPin(v => !v)}
                    aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {isRegistering && (
                <div>
                  <Label htmlFor="confirmPin" className="login-label">Confirma tu PIN</Label>
                  <div className="login-field-shell relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound size={18} className="login-input-icon" aria-hidden="true" />
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

              <Button type="submit" className="login-submit mt-2 w-full py-3 text-base" disabled={submitting}>
                {submitting && <LoaderCircle className="mr-2 animate-spin" size={18} aria-hidden="true" />}
                {submitting ? 'Procesando...' : (isRegistering ? 'Crear mi cuenta' : 'Ingresar')}
              </Button>
            </form>

            <p className="login-security-note mt-5">
              <ShieldCheck size={15} aria-hidden="true" />
              Tu acceso está protegido con PIN
            </p>
          </CardContent>
        </Card>

        <p className="login-footer mt-5 text-center">Rápido, sencillo y hecho para tu bodega.</p>
      </div>
    </main>
  );
};