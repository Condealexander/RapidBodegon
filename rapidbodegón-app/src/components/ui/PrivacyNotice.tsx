import React, { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Card, CardContent, Button } from '../index';

export const PrivacyNoticeLink = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2"
        onClick={() => setOpen(true)}
      >
        Aviso de privacidad
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600/20 text-blue-500">
                    <ShieldCheck size={20} />
                  </div>
                  <button
                    type="button"
                    className="text-slate-500 hover:text-slate-300"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar"
                  >
                    <X size={20} />
                  </button>
                </div>

                <h3 className="text-lg font-semibold text-white mb-3">Aviso de Privacidad</h3>

                <div className="space-y-3 text-sm text-slate-400">
                  <p>
                    Guardamos tu nombre, tu saldo de crédito y el historial de tus consumos y
                    pagos reportados, únicamente para llevar el control de tu cuenta en el
                    bodegón.
                  </p>
                  <p>
                    No compartimos esta información con nadie fuera del negocio, y no se usa
                    para ningún otro fin.
                  </p>
                  <p>
                    Solo tú y el administrador del bodegón pueden ver tus datos. Ningún otro
                    cliente tiene acceso a tu saldo ni a tu historial.
                  </p>
                  <p>
                    Si quieres que borremos tu cuenta, escríbenos directamente y lo hacemos sin
                    problema.
                  </p>
                </div>

                <Button className="w-full mt-6" onClick={() => setOpen(false)}>
                  Entendido
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
};
