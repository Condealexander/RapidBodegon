import React, { useEffect, useState } from 'react';
import { Store, CreditCard, Receipt, ListChecks } from 'lucide-react';
import { Card, CardContent, Button } from '../index';

const STEPS = [
  {
    icon: Store,
    title: 'Bienvenido a RapidBodegón',
    text: 'Aquí puedes ver tu saldo pendiente, el catálogo de productos y reportar tus pagos, todo desde el celular.',
  },
  {
    icon: CreditCard,
    title: '¿Cómo funciona el crédito?',
    text: 'Cuando consumes algo en el bodegón, el encargado lo carga a tu cuenta. Ese monto se suma a tu "Saldo Total Pendiente".',
  },
  {
    icon: Receipt,
    title: 'Reportar un pago',
    text: 'Cuando pagues (en Bs o en $), repórtalo en la app con la referencia bancaria. Un administrador lo valida y tu saldo baja automáticamente.',
  },
  {
    icon: ListChecks,
    title: 'Corte de cobro',
    text: 'Los cortes de cuenta son los días 3, 10, 17 y 25 de cada mes. Verás cuántos días faltan para el próximo directamente en tu pantalla.',
  },
];

const storageKey = (uid: string) => `rb_onboarding_seen_${uid}`;

export const Onboarding = ({ userId }: { userId: string }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(storageKey(userId));
      if (!seen) setOpen(true);
    } catch {
      // localStorage bloqueado (modo privado, etc.) — no mostramos nada,
      // no es crítico.
    }
  }, [userId]);

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(userId), '1');
    } catch {
      /* no pasa nada si no se pudo guardar */
    }
    setOpen(false);
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600/20 text-blue-500 mb-4">
              <Icon size={28} />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{current.title}</h3>
            <p className="text-sm text-slate-400 mb-6">{current.text}</p>

            <div className="flex justify-center gap-1.5 mb-6">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-blue-500' : 'w-1.5 bg-slate-700'
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="secondary" className="flex-1" onClick={() => setStep(s => s - 1)}>
                  Atrás
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={() => (isLast ? dismiss() : setStep(s => s + 1))}
              >
                {isLast ? 'Entendido' : 'Siguiente'}
              </Button>
            </div>

            {!isLast && (
              <button
                type="button"
                className="mt-3 text-xs text-slate-500 hover:text-slate-300"
                onClick={dismiss}
              >
                Omitir
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
